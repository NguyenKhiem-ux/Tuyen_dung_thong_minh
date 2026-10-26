import { test, expect } from "@playwright/test";

const admin = {
  id: 1,
  email: "admin@smartrecruit.ai",
  full_name: "System Admin",
  role: "admin",
};

const companyNames = ["TechNova Solutions", "DataBridge Analytics", "GreenLab Studio"];
const jobs = Array.from({ length: 23 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    title: `Platform Engineer ${String(id).padStart(2, "0")}`,
    company_name: companyNames[index % companyNames.length],
    location: id % 2 === 0 ? "Remote" : "Hà Nội",
    status: id % 3 === 0 ? "closed" : "open",
    applicants_count: id % 5,
    description: `Mô tả công việc số ${id}.`,
    skills: id % 2 === 0 ? "React, TypeScript" : "Python, SQL",
    created_at: `2026-10-${String((id % 18) + 1).padStart(2, "0")}T08:00:00Z`,
  };
});

async function signInAsAdmin(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "admin-jobs-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: admin });
}

test("admin jobs renders API metrics, filters, details and responsive pagination", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") {
      return route.fulfill({ json: { total_users: 0, total_jobs: jobs.length, total_companies: 3, total_applications: 0 } });
    }
    if (path === "/api/admin/jobs") return route.fulfill({ json: jobs });
    return route.fulfill({ json: [] });
  });
  await signInAsAdmin(page);

  await page.goto("/admin/dashboard");
  await page.locator(".admin-nav").getByRole("link", { name: "Tin tuyển dụng", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Quản lý tin tuyển dụng" })).toBeVisible();
  await expect(page.getByText("Theo dõi các vị trí tuyển dụng đang được đăng tải trên toàn hệ thống.")).toBeVisible();
  await expect(page.getByTestId("admin-jobs-total")).toHaveText("23");
  await expect(page.getByTestId("admin-jobs-open")).toHaveText(String(jobs.filter((job) => job.status === "open").length));
  await expect(page.getByTestId("admin-jobs-closed")).toHaveText(String(jobs.filter((job) => job.status === "closed").length));
  await expect(page.getByTestId("admin-jobs-applicants")).toHaveText(String(jobs.reduce((sum, job) => sum + job.applicants_count, 0)));
  await expect(page.locator(".admin-jobs-table tbody tr")).toHaveCount(10);
  await expect(page.getByText("Hiển thị 1–10 / 23 tin tuyển dụng")).toBeVisible();
  await expect(page.locator(".admin-jobs-table th", { hasText: "Thao tác" })).toHaveCount(0);

  const details = page.getByTestId("admin-job-1").getByText("Xem mô tả & kỹ năng");
  await details.click();
  await expect(page.getByTestId("admin-job-1").getByText("Mô tả công việc số 1.")).toBeVisible();
  await expect(page.getByTestId("admin-job-1").getByText("Kỹ năng:")).toBeVisible();

  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await expect(page.getByText("Hiển thị 11–20 / 23 tin tuyển dụng")).toBeVisible();
  await page.getByRole("searchbox", { name: "Tìm kiếm tin tuyển dụng" }).fill("Platform Engineer 22");
  await expect(page.getByText("Hiển thị 1–1 / 1 tin tuyển dụng")).toBeVisible();
  await expect(page.getByText("Platform Engineer 22", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByRole("combobox", { name: "Lọc theo công ty" }).selectOption("TechNova Solutions");
  await expect(page.getByText("Hiển thị 1–8 / 8 tin tuyển dụng")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByRole("combobox", { name: "Lọc theo trạng thái tin tuyển dụng" }).selectOption("closed");
  await expect(page.getByText("Hiển thị 1–7 / 7 tin tuyển dụng")).toBeVisible();

  await page.getByRole("searchbox", { name: "Tìm kiếm tin tuyển dụng" }).fill("không tồn tại");
  await expect(page.getByText("Không tìm thấy tin tuyển dụng phù hợp.")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.screenshot({ path: testInfo.outputPath("admin-jobs-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("admin-job-1")).toHaveCSS("display", "block");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("admin-jobs-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("admin jobs keeps clear loading, empty and error states", async ({ page }) => {
  let mode = "empty";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") return route.fulfill({ json: { total_users: 0, total_jobs: 0, total_companies: 0, total_applications: 0 } });
    if (path === "/api/admin/jobs") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return mode === "empty"
        ? route.fulfill({ json: [] })
        : route.fulfill({ status: 503, json: { detail: "Không thể tải danh sách tin tuyển dụng." } });
    }
    return route.fulfill({ json: [] });
  });
  await signInAsAdmin(page);

  await page.goto("/admin/dashboard");
  await page.locator(".admin-nav").getByRole("link", { name: "Tin tuyển dụng", exact: true }).click();
  await expect(page.locator(".admin-jobs-loading")).toBeVisible();
  await expect(page.getByText("Chưa có tin tuyển dụng nào.")).toBeVisible();

  mode = "error";
  await page.reload();
  await page.locator(".admin-nav").getByRole("link", { name: "Tin tuyển dụng", exact: true }).click();
  await expect(page.getByText("Không thể tải danh sách tin tuyển dụng.")).toBeVisible();
  await expect(page.locator(".admin-jobs-table")).toHaveCount(0);
});
