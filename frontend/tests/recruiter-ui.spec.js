import { test, expect } from "@playwright/test";

const recruiter = {
  id: 2,
  email: "recruiter1@demo.ai",
  full_name: "Nguyễn Minh Anh",
  role: "recruiter",
};

const stats = {
  total_jobs: 8,
  open_jobs: 5,
  total_applications: 34,
  average_match_score: 78.6,
  by_status: { applied: 16, screening: 9, interview: 6, hired: 3 },
  top_candidates: [
    { candidate_name: "Lê Hoàng Nam", job_title: "Frontend Developer", final_score: 82.5 },
    { candidate_name: "Trần Thu Hà", job_title: "Product Designer", final_score: 94 },
    { candidate_name: "Phạm Gia Bảo", job_title: "Backend Developer", final_score: 88.2 },
  ],
};

test("recruiter dashboard matches the new header and statistics layout", async ({ page }, testInfo) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: recruiter });
    if (path === "/api/stats/recruiter") return route.fulfill({ json: stats });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 1 } });
    if (path === "/api/notifications") {
      return route.fulfill({
        json: [
          {
            id: 1,
            title: "Ứng viên mới",
            message: "Bạn vừa nhận một hồ sơ mới.",
            type: "application_received",
            is_read: false,
            created_at: "2026-10-09T08:00:00Z",
          },
        ],
      });
    }
    if (path === "/api/company/me") {
      return route.fulfill({ json: { name: "Smart Tech", description: "", website: "", location: "", industry: "" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "browser-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: recruiter });

  await page.goto("/recruiter/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Bảng điều khiển Nhà tuyển dụng" })).toBeVisible();
  await expect(page.locator(".recruiter-nav a")).toHaveCount(5);
  await expect(page.locator(".dashboard > .tabs")).toHaveCount(0);
  await expect(page.locator('[data-testid="recruiter-total-jobs"]')).toHaveText("8");
  await expect(page.locator('[data-testid="recruiter-total-applications"]')).toHaveText("34");
  await expect(page.locator(".recruiter-candidate-row").nth(0)).toContainText("Trần Thu Hà");
  await expect(page.locator(".recruiter-candidate-row").nth(1)).toContainText("Phạm Gia Bảo");
  await expect(page.locator(".recruiter-candidate-row").nth(2)).toContainText("Lê Hoàng Nam");
  await expect(page.getByLabel("Điểm phù hợp của Trần Thu Hà")).toHaveAttribute("aria-valuenow", "94");
  await expect(page.getByLabel(/^Thông báo/)).toBeVisible();
  await expect(page.locator(".site-user-menu summary")).toBeVisible();

  const navItems = [
    ["Công ty", "company"],
    ["Tin tuyển dụng", "jobs"],
    ["Ứng viên & ATS", "applications"],
    ["Lịch phỏng vấn", "interviews"],
    ["Thống kê", "overview"],
  ];
  for (const [label, tab] of navItems) {
    const link = page.locator(".recruiter-nav").getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page.locator(".recruiter-dashboard")).toHaveAttribute("data-active-tab", tab);
    await expect(link).toHaveAttribute("aria-current", "page");
  }

  await page.screenshot({ path: testInfo.outputPath("recruiter-dashboard.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở menu" }).click();
  await expect(page.locator(".recruiter-nav")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(page.locator(".recruiter-stat-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Đóng menu" }).click();
  await page.screenshot({ path: testInfo.outputPath("recruiter-dashboard-mobile.png"), fullPage: true });
});
