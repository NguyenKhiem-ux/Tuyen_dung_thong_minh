import { test, expect } from "@playwright/test";

const apiURL = process.env.TEST_API_URL || "http://127.0.0.1:8000";

async function login(page, role = "candidate") {
  await page.goto("/login");
  const email = role === "admin" ? "admin@smartrecruit.ai" : `${role}1@demo.ai`;
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(role === "admin" ? "Admin@123" : "Password123");
  await page.locator(".auth-form").getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(role === "candidate" ? /\/$/ : new RegExp(`/${role}/dashboard$`));
  await expect(page.locator(".site-user-info strong")).not.toBeEmpty();
}

test("public jobs stay public, personal and recruiter actions stay protected", async ({ request }) => {
  const response = await request.get(`${apiURL}/api/jobs?status=open`);
  expect(response.ok()).toBeTruthy();
  const jobs = await response.json();
  expect(Array.isArray(jobs)).toBeTruthy();
  expect(jobs.every((job) => job.status === "open")).toBeTruthy();
  if (jobs.length) {
    const detail = await request.get(`${apiURL}/api/jobs/${jobs[0].id}`);
    expect(detail.ok()).toBeTruthy();
    expect((await detail.json()).title).toBe(jobs[0].title);
    const company = jobs.find((job) => job.company_name);
    if (company) {
      const result = await request.get(`${apiURL}/api/jobs`, {
        params: { q: company.company_name, location: company.location },
      });
      expect((await result.json()).map((job) => job.id)).toContain(company.id);
    }
  }
  const missing = await request.get(`${apiURL}/api/jobs/2147483647`);
  expect(missing.status()).toBe(404);
  for (const path of [
    "/me",
    "/jobs/mine",
    "/resumes/me",
    "/applications/me",
    "/recommendations",
    "/interviews/me",
    "/admin/users",
  ]) {
    expect([401, 403]).toContain((await request.get(`${apiURL}/api${path}`)).status());
  }
  expect([401, 403]).toContain((await request.post(`${apiURL}/api/jobs/1/apply`)).status());
  expect([401, 403]).toContain((await request.post(`${apiURL}/api/jobs`, { data: {} })).status());
});

test("guest Home, real job details, search, refresh, history and auth entry points", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const jobs = await (await request.get(`${apiURL}/api/jobs?status=open`)).json();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tìm công việc phù hợp");
  await expect(page.locator(".site-auth-actions")).toBeVisible();
  await expect(page.locator(".job-skeleton")).toHaveCount(0);
  await expect(page.locator(".home-job-grid").first().locator("article")).toHaveCount(Math.min(3, jobs.length));
  const featured = [...jobs]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .sort((a, b) => b.applicants_count - a.applicants_count);
  if (featured.length) {
    await expect(page.locator(".home-job-grid").first().locator("h3").first()).toHaveText(featured[0].title);
    await page.locator(".home-job-detail-link").first().click();
    await expect(page.getByRole("heading", { name: featured[0].title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Ứng tuyển ngay" })).toBeEnabled();
    await page.getByRole("button", { name: "Ứng tuyển ngay" }).click();
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await page.goBack();
    await expect(page.getByRole("heading", { name: featured[0].title })).toBeVisible();
  }
  await page.goto("/");
  await page.locator(".popular-searches").getByRole("link", { name: "Data Analyst", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Từ khóa việc làm" })).toHaveValue("Data Analyst");
  await page.getByRole("textbox", { name: "Từ khóa việc làm" }).fill("Python");
  await page.getByLabel("Địa điểm", { exact: true }).fill("Remote");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page).toHaveURL(/q=Python&location=Remote/);
  await page.reload();
  await expect(page.getByLabel("Địa điểm", { exact: true })).toHaveValue("Remote");
  const expected = await (
    await request.get(`${apiURL}/api/jobs`, { params: { q: "Python", location: "Remote" } })
  ).json();
  await expect(page.locator("article.home-job-card")).toHaveCount(expected.length);
  await page.goto("/");
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Khám phá AI" }).click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Tạo tài khoản", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("candidate stays on Home after login and refresh, old screens and logout work", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await login(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tìm công việc phù hợp");
  await expect(page.locator(".site-nav").getByRole("link")).toHaveCount(6);
  await expect(page.locator(".home-cta-actions")).not.toContainText("Tạo tài khoản");
  await page.reload();
  await expect(page.locator(".site-user-info strong")).not.toBeEmpty();
  await expect(page).toHaveURL(/\/$/);
  expect(
    requests.some((path) => /\/api\/(stats|recommendations|interviews|resumes|applications)/.test(path)),
  ).toBeFalsy();
  await page.screenshot({ path: testInfo.outputPath("candidate-home-1366.png"), fullPage: true });
  await page.getByRole("link", { name: "Khám phá AI" }).click();
  await expect(page).toHaveURL(/\/candidate\/recommendations$/);
  await expect(page.locator(".candidate-dashboard")).toBeVisible();
  await page.goto("/candidate/dashboard");
  await expect(page.locator(".stat-grid")).toBeVisible();
  for (const path of ["resume", "applications", "interviews"]) {
    await page.goto(`/candidate/${path}`);
    await expect(page.locator(".candidate-dashboard")).toBeVisible();
  }
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở menu", exact: true }).click();
  await expect(page.locator(".site-nav").getByRole("link")).toHaveCount(6);
  await expect(page.locator(".mobile-account").getByRole("link", { name: "Bảng điều khiển" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("candidate-menu-mobile.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(page.locator(".site-nav")).not.toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator(".site-user-menu summary").click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".site-auth-actions")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sra_token"))).toBeNull();
  await page.goto("/candidate/dashboard");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  expect(errors).toEqual([]);
});

test("AI login returns to recommendations and external redirects are rejected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Khám phá AI" }).click();
  await page.locator('input[type="email"]').fill("candidate1@demo.ai");
  await page.locator('input[type="password"]').fill("Password123");
  await page.locator(".auth-form").getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/candidate\/recommendations$/);
  await page.goto("/login?redirect=https%3A%2F%2Fexample.com");
  await expect(page).toHaveURL(/\/$/);
});

test("candidate application handles missing CV and success without changing the database", async ({ page }) => {
  await login(page);
  await page.locator(".home-job-detail-link").first().click();
  await expect(page.getByRole("button", { name: "Ứng tuyển ngay", exact: true })).toBeEnabled();
  await page.route("**/api/jobs/*/apply", (route) =>
    route.fulfill({ status: 400, json: { detail: "Please upload a CV before applying" } }),
  );
  await page.getByRole("button", { name: "Ứng tuyển ngay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bạn chưa có CV" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tải CV ngay" })).toHaveAttribute("href", "/candidate/resume");
  await page.getByRole("button", { name: "Để sau" }).click();
  await page.unroute("**/api/jobs/*/apply");
  await page.route("**/api/jobs/*/apply", (route) => route.fulfill({ json: { match: { final_score: 75 } } }));
  await page.getByRole("button", { name: "Ứng tuyển ngay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ứng tuyển thành công" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem đơn ứng tuyển" })).toHaveAttribute(
    "href",
    "/candidate/applications",
  );
  await expect(page.getByRole("button", { name: "Đã ứng tuyển", exact: true })).toBeDisabled();
});

test("recruiter header drives the API-backed dashboard and admin remains reachable", async ({ page, request }) => {
  for (const role of ["recruiter", "admin"]) {
    await login(page, role);
    await expect(page).toHaveURL(new RegExp(`/${role}/dashboard$`));
    if (role === "recruiter") {
      const token = await page.evaluate(() => localStorage.getItem("sra_token"));
      const statsResponse = await request.get(`${apiURL}/api/stats/recruiter`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(statsResponse.ok()).toBeTruthy();
      const stats = await statsResponse.json();
      const navItems = [
        ["Thống kê", "overview"],
        ["Công ty", "company"],
        ["Tin tuyển dụng", "jobs"],
        ["Ứng viên & ATS", "applications"],
        ["Lịch phỏng vấn", "interviews"],
      ];

      await expect(page.getByRole("heading", { name: "Bảng điều khiển Nhà tuyển dụng", level: 1 })).toBeVisible();
      await expect(page.getByText("Theo dõi hiệu quả tuyển dụng và những ứng viên nổi bật của bạn.")).toBeVisible();
      await expect(page.locator(".recruiter-nav a")).toHaveCount(5);
      await expect(page.locator(".dashboard > .tabs")).toHaveCount(0);
      await expect(page.getByLabel(/^Thông báo/)).toBeVisible();
      await expect(page.locator('[data-testid="recruiter-total-jobs"]')).toHaveText(String(stats.total_jobs));
      await expect(page.locator('[data-testid="recruiter-total-applications"]')).toHaveText(
        String(stats.total_applications),
      );

      if (stats.top_candidates.length) {
        const expectedTop = [...stats.top_candidates].sort((a, b) => b.final_score - a.final_score)[0];
        await expect(page.locator(".recruiter-candidate-row").first()).toContainText(expectedTop.candidate_name);
      }

      for (const [label, tab] of navItems) {
        await page.locator(".recruiter-nav").getByRole("link", { name: label, exact: true }).click();
        await expect(page.locator(".recruiter-dashboard")).toHaveAttribute("data-active-tab", tab);
        await expect(page.locator(".recruiter-nav").getByRole("link", { name: label, exact: true })).toHaveAttribute(
          "aria-current",
          "page",
        );
      }
    } else {
      await expect(page.locator(".dashboard-title")).toBeVisible();
    }
    await page.goto("/candidate/resume");
    await expect(page.getByText("Trang này không dành cho vai trò của bạn.")).toBeVisible();
    await page.locator(".site-user-menu summary").click();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  }
});

test("loading, empty and failed jobs do not hide the Home", async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/jobs?*", async (route) => {
    await pending;
    await route.fulfill({ json: [] });
  });
  await page.goto("/");
  await expect(page.locator(".job-skeleton")).toHaveCount(8);
  release();
  await expect(page.getByText("Hiện chưa có việc làm phù hợp.")).toHaveCount(2);
  await page.unroute("**/api/jobs?*");
  await page.route("**/api/jobs?*", (route) => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await page.reload();
  await expect(page.getByText("Không thể tải danh sách việc làm lúc này.")).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#smart-ai")).toBeVisible();
  await page.unroute("**/api/jobs?*");
  await page.getByRole("button", { name: "Thử lại", exact: true }).first().click();
  await expect(page.getByText("Không thể tải danh sách việc làm lúc này.")).toHaveCount(0);
});

test("desktop, tablet and mobile layouts, image and mobile navigation", async ({ page }, testInfo) => {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".job-skeleton")).toHaveCount(0);
    await expect(page.locator(".home-hero-art")).toBeVisible();
    expect(await page.locator(".home-hero-art").evaluate((img) => img.complete && img.naturalWidth > 0)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const overlaps = await page.evaluate(() => {
      const headline = document.querySelector(".home-hero h1").getBoundingClientRect();
      const search = document.querySelector(".home-search").getBoundingClientRect();
      return headline.bottom > search.top;
    });
    expect(overlaps).toBeFalsy();
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    if (width < 1200) {
      await page.getByRole("button", { name: "Mở menu", exact: true }).click();
      await expect(page.locator(".site-nav")).toBeVisible();
      await page.locator(".site-nav").getByRole("link", { name: "Tìm việc", exact: true }).click();
      await expect(page).toHaveURL(/\/jobs$/);
      await expect(page.locator(".site-nav")).not.toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
});
