import { expect, test } from "@playwright/test";

const apiURL = process.env.TEST_API_URL || "http://127.0.0.1:8000";

test("guest can browse and search public jobs while candidate pages stay protected", async ({ page, request }) => {
  const jobsResponse = await request.get(`${apiURL}/api/jobs`, { params: { status: "open" } });
  expect(jobsResponse.ok()).toBeTruthy();
  const jobs = await jobsResponse.json();
  const sample = jobs.find((job) => job.location) || jobs[0] || {};
  const keyword = sample.title?.split(/\s+/)[0] || "Python";
  const location = sample.location || "";
  const expectedResponse = await request.get(`${apiURL}/api/jobs`, {
    params: { q: keyword, location, status: "open" },
  });
  expect(expectedResponse.ok()).toBeTruthy();
  const expectedJobs = await expectedResponse.json();

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.site-nav a[href="/jobs"]').click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.locator(".public-jobs-results")).toBeVisible();
  await expect(page.locator("article.home-job-card")).toHaveCount(jobs.length);

  await page.reload();
  await expect(page).toHaveURL(/\/jobs$/);

  await page.goto("/");
  await page.locator('.home-hero input[name="q"]').fill(keyword);
  if (location) await page.locator('.home-hero input[name="location"]').fill(location);
  await page.locator(".home-hero form").evaluate((form) => form.requestSubmit());
  await expect(page).toHaveURL(/\/jobs\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("q")).toBe(keyword);
  expect(url.searchParams.get("location") || "").toBe(location);
  await expect(page.locator('.job-search-band input[name="q"]')).toHaveValue(keyword);
  if (location) await expect(page.locator('.job-search-band input[name="location"]')).toHaveValue(location);
  await expect(page.locator("article.home-job-card")).toHaveCount(expectedJobs.length);

  await page.evaluate(() => localStorage.clear());
  await page.goto("/candidate/dashboard");
  await expect(page).toHaveURL(/\/login\?redirect=/);
});
