import { test, expect } from "@playwright/test";

const admin = {
  id: 1,
  email: "admin@smartrecruit.ai",
  full_name: "System Admin",
  role: "admin",
};

const stats = {
  total_users: 13,
  total_jobs: 5,
  open_jobs: 4,
  total_companies: 2,
  total_applications: 15,
  users_by_role: { admin: 1, recruiter: 4, candidate: 8 },
  applications_by_status: { applied: 5, screening: 2, interview: 2, offer: 3, hired: 2, rejected: 1 },
};

test("admin header controls the API-backed system overview and existing sections", async ({ page }, testInfo) => {
  const errors = [];
  let users = [
    {
      id: 10,
      email: "candidate@example.com",
      full_name: "Nguyễn Thị Vân",
      role: "candidate",
      is_active: true,
    },
  ];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") return route.fulfill({ json: stats });
    if (path === "/api/admin/users" && route.request().method() === "GET") {
      return route.fulfill({ json: users });
    }
    const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && route.request().method() === "PATCH") {
      const id = Number(userMatch[1]);
      const update = route.request().postDataJSON();
      users = users.map((user) => (user.id === id ? { ...user, ...update } : user));
      return route.fulfill({ json: users.find((user) => user.id === id) });
    }
    if (path === "/api/admin/jobs") {
      return route.fulfill({
        json: [
          {
            id: 20,
            title: "Frontend Developer",
            company_name: "TechNova Solutions",
            location: "Hà Nội",
            status: "open",
            applicants_count: 3,
            skills: "React",
          },
        ],
      });
    }
    if (path === "/api/companies") {
      return route.fulfill({
        json: [
          {
            id: 30,
            name: "TechNova Solutions",
            industry: "Software",
            location: "Hà Nội",
            description: "Nền tảng tuyển dụng công nghệ.",
            website: "https://technova.example.com",
          },
        ],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "admin-browser-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: admin });

  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tổng quan hệ thống" })).toBeVisible();
  await expect(page.getByText("Thống kê hoạt động và tình hình tuyển dụng trên toàn nền tảng.")).toBeVisible();
  await expect(page.locator(".admin-nav a")).toHaveCount(4);
  await expect(page.locator(".admin-nav").getByRole("link").allTextContents()).resolves.toEqual([
    "Thống kê hệ thống",
    "Người dùng",
    "Tin tuyển dụng",
    "Công ty",
  ]);
  await expect(page.locator(".admin-nav").getByRole("link", { name: "Thống kê hệ thống" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator(".site-brand")).toHaveAttribute("href", "/admin/dashboard");
  await expect(page.locator(".site-user-info strong")).toHaveText("System Admin");
  await expect(page.locator(".site-user-info span")).toHaveText("Quản trị viên");
  await expect(page.locator(".dashboard > .tabs")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Trang chủ", exact: true })).toHaveCount(0);

  await expect(page.getByTestId("admin-total-users")).toHaveText("13");
  await expect(page.getByTestId("admin-total-jobs")).toHaveText("5");
  await expect(page.getByText("4 đang mở", { exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-total-companies")).toHaveText("2");
  await expect(page.getByTestId("admin-total-applications")).toHaveText("15");
  await expect(page.getByTestId("admin-role-admin")).toContainText("Quản trị viên");
  await expect(page.getByTestId("admin-role-admin")).toContainText("7,7%");
  await expect(page.getByTestId("admin-role-recruiter")).toContainText("30,8%");
  await expect(page.getByTestId("admin-role-candidate")).toContainText("61,5%");
  await expect(page.getByTestId("admin-status-applied")).toContainText("Đã ứng tuyển");
  await expect(page.getByTestId("admin-status-applied")).toContainText("33,3%");
  await expect(page.getByTestId("admin-status-offer")).toContainText("20%");
  await expect(page.locator('[data-testid^="admin-status-"]')).toHaveCount(6);

  await page.screenshot({ path: testInfo.outputPath("admin-overview.png"), fullPage: true });

  const usersLink = page.locator(".admin-nav").getByRole("link", { name: "Người dùng", exact: true });
  await usersLink.click();
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-active-tab", "users");
  await expect(usersLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Nguyễn Thị Vân", { exact: true })).toBeVisible();
  await page.locator(".data-table select").selectOption("recruiter");
  await expect(page.locator(".data-table select")).toHaveValue("recruiter");
  await page.getByRole("button", { name: "Khóa", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mở khóa", exact: true })).toBeVisible();

  const jobsLink = page.locator(".admin-nav").getByRole("link", { name: "Tin tuyển dụng", exact: true });
  await jobsLink.click();
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-active-tab", "jobs");
  await expect(page.getByText("Frontend Developer", { exact: true })).toBeVisible();

  const companiesLink = page.locator(".admin-nav").getByRole("link", { name: "Công ty", exact: true });
  await companiesLink.click();
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-active-tab", "companies");
  await expect(page.getByText("TechNova Solutions", { exact: true })).toBeVisible();

  await page.locator(".site-brand").click();
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-active-tab", "overview");
  await companiesLink.click();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Tổng quan hệ thống" })).toBeVisible();
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-active-tab", "overview");

  await page.setViewportSize({ width: 900, height: 900 });
  const tabletCards = await page.locator(".admin-metric-card").evaluateAll((cards) =>
    cards.map((card) => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })),
  );
  expect(tabletCards[0].y).toBe(tabletCards[1].y);
  expect(tabletCards[2].y).toBeGreaterThan(tabletCards[0].y);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở menu" }).click();
  await expect(page.locator(".admin-nav")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const mobileCards = await page.locator(".admin-metric-card").evaluateAll((cards) =>
    cards.map((card) => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })),
  );
  expect(new Set(mobileCards.map((card) => Math.round(card.x))).size).toBe(1);
  expect(mobileCards[1].y).toBeGreaterThan(mobileCards[0].y);
  await page.getByRole("button", { name: "Đóng menu" }).click();
  await page.screenshot({ path: testInfo.outputPath("admin-overview-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("candidate and recruiter keep their existing header navigation", async ({ page }) => {
  const candidate = { id: 2, email: "candidate@example.com", full_name: "Candidate User", role: "candidate" };
  const recruiter = { id: 3, email: "recruiter@example.com", full_name: "Recruiter User", role: "recruiter" };
  let currentUser = candidate;

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: currentUser });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/stats/recruiter") {
      return route.fulfill({
        json: {
          total_jobs: 0,
          open_jobs: 0,
          total_applications: 0,
          average_match_score: 0,
          by_status: {},
          top_candidates: [],
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "role-header-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: candidate });

  await page.goto("/");
  await expect(page.locator(".admin-nav")).toHaveCount(0);
  await expect(page.locator(".site-nav").getByRole("link", { name: "CV của tôi", exact: true })).toBeVisible();

  currentUser = recruiter;
  await page.evaluate((user) => localStorage.setItem("sra_user", JSON.stringify(user)), recruiter);
  await page.goto("/recruiter/dashboard");
  await expect(page.locator(".admin-nav")).toHaveCount(0);
  await expect(page.locator(".recruiter-nav a")).toHaveCount(5);
  await expect(page.locator(".recruiter-nav").getByRole("link", { name: "Thống kê", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
