import { expect, test } from "@playwright/test";

const apiURL = process.env.TEST_API_URL || "http://127.0.0.1:8000";

test("jobs redesign keeps real search, filters, sort and responsive states", async ({ page, request }, testInfo) => {
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const jobs = await (await request.get(`${apiURL}/api/jobs`, { params: { status: "open" } })).json();
  const remoteJobs = jobs.filter(
    (job) => job.location.toLowerCase().includes("remote") && job.employment_type.toLowerCase() === "full-time",
  );

  await page.goto("/jobs");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tìm việc phù hợp với bạn" })).toBeVisible();
  await expect(page.locator('.site-nav a[href="/jobs"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator("article.job-list-item")).toHaveCount(jobs.length);

  await page.getByRole("link", { name: "Remote", exact: true }).click();
  await expect(page).toHaveURL(/location=Remote/);
  await page.getByRole("link", { name: "Full-time", exact: true }).click();
  await expect(page).toHaveURL(/employment=full-time/);
  await expect(page.locator("article.job-list-item")).toHaveCount(remoteJobs.length);

  await page.getByLabel("Sắp xếp việc làm").selectOption("oldest");
  await expect(page).toHaveURL(/sort=oldest/);
  const expectedTitles = [...remoteJobs]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((job) => job.title);
  await expect(page.locator("article.job-list-item h2")).toHaveText(expectedTitles);

  await page.goto(`/jobs?q=${Date.now()}-no-result`);
  await expect(page.getByRole("heading", { name: "Không tìm thấy công việc phù hợp" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Xóa bộ lọc" })).toHaveAttribute("href", "/jobs");

  await page.goto("/jobs");
  await page.route("**/api/jobs?*", (route) => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Không thể tải danh sách việc làm" })).toBeVisible();
  await page.unroute("**/api/jobs?*");
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.locator("article.job-list-item")).toHaveCount(jobs.length);
  consoleErrors.length = 0;

  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1366, 768],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === 375) await page.screenshot({ path: testInfo.outputPath("jobs-mobile-375.png"), fullPage: true });
    if (width === 1366) await page.screenshot({ path: testInfo.outputPath("jobs-desktop-1366.png"), fullPage: true });
  }

  expect(consoleErrors).toEqual([]);
});

test("candidate jobs use backend applications and recommendations", async ({ page, request }, testInfo) => {
  const login = await request.post(`${apiURL}/api/auth/login`, {
    data: { email: "candidate1@demo.ai", password: "Password123" },
  });
  expect(login.ok()).toBeTruthy();
  const auth = await login.json();

  await page.goto("/");
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem("sra_token", token);
      localStorage.setItem("sra_user", JSON.stringify(user));
    },
    { token: auth.access_token, user: auth.user },
  );

  const applicationsResponse = page.waitForResponse((response) => response.url().includes("/api/applications/me"));
  const recommendationsResponse = page.waitForResponse((response) => response.url().includes("/api/recommendations"));
  await page.goto("/jobs");
  const applications = await (await applicationsResponse).json();
  const recommendations = await (await recommendationsResponse).json();
  const openJobs = await (await request.get(`${apiURL}/api/jobs`, { params: { status: "open" } })).json();
  const openIds = new Set(openJobs.map((job) => job.id));

  await expect(page.getByRole("button", { name: "Đã ứng tuyển" })).toHaveCount(
    applications.filter((application) => openIds.has(application.job_id)).length,
  );
  await expect(page.locator(".job-match-score")).toHaveCount(recommendations.length);
  await expect(page.locator('.site-nav a[href="/jobs"]')).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("jobs-candidate-1366.png"), fullPage: true });
});
