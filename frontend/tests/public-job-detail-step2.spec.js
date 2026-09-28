import { expect, test } from "@playwright/test";

const apiURL = process.env.TEST_API_URL || "http://127.0.0.1:8000";

test("guest can open, refresh, and read a public job detail page", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const jobsResponse = await request.get(`${apiURL}/api/jobs`, { params: { status: "open" } });
  expect(jobsResponse.ok()).toBeTruthy();
  const jobs = await jobsResponse.json();
  expect(jobs.length).toBeGreaterThan(0);
  const job = jobs[0];

  await page.goto("/jobs");
  await page.evaluate(() => localStorage.clear());
  const detailResponse = page.waitForResponse((response) => response.url().includes(`/api/jobs/${job.id}`));
  await page.locator(`.home-job-card:has(a[href="/jobs/${job.id}"]) .home-job-detail-link`).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${job.id}$`));
  expect((await detailResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: job.title })).toBeVisible();
  await expect(page.locator(".job-detail-title")).toContainText(job.company_name || "Nhà tuyển dụng");
  await expect(page.locator(".job-detail-title .home-job-meta")).toContainText(job.location || "Chưa cập nhật");
  await expect(page.getByRole("button", { name: job.status === "open" ? "Ứng tuyển ngay" : "Đã ngừng tuyển" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/jobs/${job.id}$`));
  await expect(page.getByRole("heading", { name: job.title })).toBeVisible();

  await page.goto("/jobs/2147483647");
  await expect(page.getByRole("heading", { name: "Không tìm thấy công việc" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quay lại danh sách việc làm" })).toHaveAttribute("href", "/jobs");
  errors.length = 0;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/jobs/${job.id}`);
  await expect(page.getByRole("heading", { name: job.title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto("/candidate/dashboard");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  expect(errors).toEqual([]);
});
