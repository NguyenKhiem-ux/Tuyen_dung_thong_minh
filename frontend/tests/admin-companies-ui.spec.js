import { test, expect } from "@playwright/test";

const admin = {
  id: 1,
  email: "admin@smartrecruit.ai",
  full_name: "System Admin",
  role: "admin",
};

const industries = ["Software", "Tài chính", "Giáo dục"];
const locations = ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"];
const companies = Array.from({ length: 23 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    name: `Doanh nghiệp ${String(id).padStart(2, "0")}`,
    industry: industries[index % industries.length],
    location: locations[index % locations.length],
    description: `Mô tả đầy đủ về doanh nghiệp số ${id} và môi trường làm việc.`,
    website: id === 2 ? "javascript:alert(1)" : `https://company${id}.example.com`,
  };
});
const jobs = companies.flatMap((company, index) =>
  Array.from({ length: (index % 3) + 1 }, (_, jobIndex) => ({
    id: company.id * 10 + jobIndex,
    title: `Vị trí ${company.id}-${jobIndex + 1}`,
    company_id: company.id,
    company_name: company.name,
    status: "open",
    applicants_count: 0,
  })),
);

async function signInAsAdmin(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "admin-companies-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: admin });
}

test("admin companies renders API cards, filters, safe details and pagination", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") {
      return route.fulfill({ json: { total_users: 0, total_jobs: jobs.length, total_companies: companies.length, total_applications: 0 } });
    }
    if (path === "/api/companies") return route.fulfill({ json: companies });
    if (path === "/api/admin/jobs") return route.fulfill({ json: jobs });
    return route.fulfill({ json: [] });
  });
  await signInAsAdmin(page);

  await page.goto("/admin/dashboard");
  const companiesLink = page.locator(".admin-nav").getByRole("link", { name: "Công ty", exact: true });
  await companiesLink.click();
  await expect(companiesLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Quản lý công ty" })).toBeVisible();
  await expect(page.getByText("Theo dõi thông tin các doanh nghiệp đang hoạt động trên hệ thống.")).toBeVisible();
  await expect(page.getByTestId("admin-companies-total")).toHaveText("23");
  await expect(page.getByTestId("admin-companies-jobs")).toHaveText(String(jobs.length));
  await expect(page.locator(".admin-company-card")).toHaveCount(10);
  await expect(page.getByText("Hiển thị 1–10 / 23 công ty")).toBeVisible();

  const firstCard = page.getByTestId("admin-company-1");
  await expect(firstCard.getByRole("heading", { name: "Doanh nghiệp 01" })).toBeVisible();
  await expect(firstCard.getByText("Software", { exact: true })).toBeVisible();
  await expect(firstCard.getByText("Hà Nội", { exact: true })).toBeVisible();
  await expect(firstCard.getByText("1 tin", { exact: true })).toBeVisible();
  const cardWebsite = firstCard.getByRole("link", { name: "https://company1.example.com" });
  await expect(cardWebsite).toHaveAttribute("target", "_blank");
  await expect(cardWebsite).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByTestId("admin-company-2").getByRole("link")).toHaveCount(0);

  await firstCard.getByRole("button", { name: "Xem thông tin" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Doanh nghiệp 01" })).toBeVisible();
  await expect(dialog.getByText("Mô tả đầy đủ về doanh nghiệp số 1 và môi trường làm việc.")).toBeVisible();
  const modalWebsite = dialog.getByRole("link", { name: "https://company1.example.com" });
  await expect(modalWebsite).toHaveAttribute("target", "_blank");
  await expect(modalWebsite).toHaveAttribute("rel", "noopener noreferrer");
  await expect(dialog.getByRole("button", { name: "Sửa" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Xóa" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("admin-company-modal.png"), fullPage: false });
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await expect(page.getByText("Hiển thị 11–20 / 23 công ty")).toBeVisible();
  await page.getByRole("searchbox", { name: "Tìm kiếm công ty" }).fill("Doanh nghiệp 22");
  await expect(page.getByText("Hiển thị 1–1 / 1 công ty")).toBeVisible();
  await expect(page.getByText("Doanh nghiệp 22", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByRole("combobox", { name: "Lọc theo lĩnh vực" }).selectOption("Software");
  await expect(page.getByText("Hiển thị 1–8 / 8 công ty")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByRole("combobox", { name: "Lọc theo địa điểm công ty" }).selectOption("Đà Nẵng");
  await expect(page.getByText("Hiển thị 1–7 / 7 công ty")).toBeVisible();
  await page.getByRole("searchbox", { name: "Tìm kiếm công ty" }).fill("không tồn tại");
  await expect(page.getByText("Không tìm thấy công ty phù hợp.")).toBeVisible();

  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("admin-companies-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const cardPositions = await page.locator(".admin-company-card").evaluateAll((cards) =>
    cards.map((card) => ({ x: card.getBoundingClientRect().x, width: card.getBoundingClientRect().width })),
  );
  expect(new Set(cardPositions.map((card) => Math.round(card.x))).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("admin-companies-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("admin companies keeps clear loading, empty and error states", async ({ page }) => {
  let mode = "empty";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") return route.fulfill({ json: { total_users: 0, total_jobs: 0, total_companies: 0, total_applications: 0 } });
    if (path === "/api/admin/jobs") return route.fulfill({ json: [] });
    if (path === "/api/companies") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return mode === "empty"
        ? route.fulfill({ json: [] })
        : route.fulfill({ status: 503, json: { detail: "Không thể tải danh sách công ty." } });
    }
    return route.fulfill({ json: [] });
  });
  await signInAsAdmin(page);

  await page.goto("/admin/dashboard");
  await page.locator(".admin-nav").getByRole("link", { name: "Công ty", exact: true }).click();
  await expect(page.locator(".admin-companies-loading")).toBeVisible();
  await expect(page.getByText("Chưa có công ty nào.")).toBeVisible();

  mode = "error";
  await page.reload();
  await page.locator(".admin-nav").getByRole("link", { name: "Công ty", exact: true }).click();
  await expect(page.getByText("Không thể tải danh sách công ty.")).toBeVisible();
  await expect(page.locator(".admin-company-card")).toHaveCount(0);
});
