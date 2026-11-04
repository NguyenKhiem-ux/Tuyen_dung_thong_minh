import { expect, test } from "@playwright/test";

const candidate = { id: 2, email: "candidate@example.com", full_name: "Candidate A", role: "candidate" };
const job = {
  id: 7,
  title: "Backend Developer",
  company_name: "ACME",
  location: "Remote",
  employment_type: "Full-time",
  salary_range: "25 - 35 triệu",
  min_experience: 2,
  applicants_count: 3,
  description: "Xây dựng API với Python và FastAPI.",
  skills: "Python, FastAPI, PostgreSQL",
  status: "open",
  created_at: "2026-10-01T03:00:00Z",
};

async function signIn(page, user = candidate) {
  await page.addInitScript(({ storedUser }) => {
    localStorage.setItem("sra_token", "candidate-token");
    localStorage.setItem("sra_user", JSON.stringify(storedUser));
  }, { storedUser: user });
}

test("guest keeps the job context when AI matching requires login", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/jobs/${job.id}`) return route.fulfill({ json: job });
    return route.fulfill({ json: [] });
  });

  await page.goto(`/jobs/${job.id}`);
  await expect(page.getByRole("button", { name: "Ứng tuyển ngay", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chấm điểm CV với AI", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(`/jobs/${job.id}`);
});

test("candidate without a CV is guided to upload or use CV Builder", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: candidate });
    if (path === `/api/jobs/${job.id}`) return route.fulfill({ json: job });
    if (path === "/api/resumes/me") return route.fulfill({ json: [] });
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });

  await page.goto(`/jobs/${job.id}`);
  await page.getByRole("button", { name: "Chấm điểm CV với AI", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Chấm điểm CV với AI" });
  await expect(dialog).toContainText("Bạn chưa có CV");
  await expect(dialog.getByRole("link", { name: "Tải CV", exact: true })).toHaveAttribute("href", "/candidate/cv");
  await expect(dialog.getByRole("link", { name: "Tạo CV trực tuyến", exact: true })).toHaveAttribute(
    "href",
    "/candidate/cv?view=builder",
  );
});

test("AI scoring errors stay on Job Detail and show a clear message", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: candidate });
    if (path === `/api/jobs/${job.id}`) return route.fulfill({ json: job });
    if (path === "/api/resumes/me") {
      return route.fulfill({ json: [{ id: 6, filename: "active.pdf", is_active: true }] });
    }
    if (path === "/api/recommendations" && request.method() === "POST") {
      return route.fulfill({ status: 503, json: { detail: "Dịch vụ AI đang bận, vui lòng thử lại." } });
    }
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });

  await page.goto(`/jobs/${job.id}`);
  await page.getByRole("button", { name: "Chấm điểm CV với AI", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Chấm điểm CV với AI" });
  await dialog.getByRole("button", { name: "Chấm điểm CV", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Dịch vụ AI đang bận");
  await expect(page).toHaveURL(`/jobs/${job.id}`);
});

test("recruiter Job Detail does not expose the candidate AI action", async ({ page }) => {
  const recruiter = { id: 9, email: "recruiter@example.com", full_name: "Recruiter A", role: "recruiter" };
  await signIn(page, recruiter);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: recruiter });
    if (path === `/api/jobs/${job.id}`) return route.fulfill({ json: job });
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });

  await page.goto(`/jobs/${job.id}`);
  await expect(page.locator(".detail-ai-button")).toHaveCount(0);
  await expect(page.locator(".detail-apply-button")).toBeDisabled();
});

test("candidate selects a CV, scores one job once, and keeps the result after refresh", async ({ page }, testInfo) => {
  await signIn(page);
  let analyzeCalls = 0;
  let applicationCalls = 0;
  let payload = null;
  const result = {
    items: [{
      job,
      final_score: 82,
      skill_score: 90,
      experience_score: 75,
      semantic_score: 81,
      project_score: 79,
      matched_skills: ["python", "fastapi"],
      partial_skills: [],
      missing_skills: ["postgresql"],
      preferred_skills: [],
      evidence: { python: "…Python and FastAPI…" },
      explanation: "CV phù hợp tốt với yêu cầu backend của công việc.",
      engine_version: "3.0",
    }],
    resume_insights: { tips: [] },
    analyzed_count: 1,
    candidate_limit: 1,
    duration_ms: 8.5,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: candidate });
    if (path === `/api/jobs/${job.id}`) return route.fulfill({ json: job });
    if (path === "/api/resumes/me") return route.fulfill({ json: [
      { id: 5, filename: "secondary.pdf", is_active: false },
      { id: 6, filename: "active.pdf", is_active: true },
    ] });
    if (path === "/api/recommendations" && request.method() === "POST") {
      analyzeCalls += 1;
      payload = request.postDataJSON();
      await new Promise((resolve) => setTimeout(resolve, 80));
      return route.fulfill({ json: result });
    }
    if (path.endsWith("/apply")) {
      applicationCalls += 1;
      return route.fulfill({ json: {} });
    }
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });

  await page.goto(`/jobs/${job.id}`);
  await page.getByRole("button", { name: "Chấm điểm CV với AI", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Chấm điểm CV với AI" });
  const resumeSelect = dialog.getByRole("combobox", { name: "Chọn CV cần đánh giá", exact: true });
  await expect(resumeSelect).toHaveValue("6");
  await resumeSelect.selectOption("5");
  await page.screenshot({ path: testInfo.outputPath("job-ai-match-selector.png"), fullPage: true });
  const analyzeButton = dialog.getByRole("button", { name: "Chấm điểm CV", exact: true });
  await analyzeButton.evaluate((button) => {
    button.click();
    button.click();
  });

  await expect(page).toHaveURL(`/candidate/recommendations?job_id=${job.id}&resume_id=5`);
  expect(analyzeCalls).toBe(1);
  expect(applicationCalls).toBe(0);
  expect(payload).toEqual({
    resume_id: 5,
    position: job.title,
    mode: "single",
    job_id: job.id,
    limit: 1,
  });
  await expect(page.locator(".recommendation-context-banner")).toContainText(job.title);
  await expect(page.locator(".recommendation-context-banner")).toContainText("secondary.pdf");
  await expect(page.getByTestId(`recommendation-card-${job.id}`)).toContainText("82%");
  await expect(page.getByRole("link", { name: "Quay lại chi tiết công việc" })).toHaveAttribute(
    "href",
    `/jobs/${job.id}`,
  );

  await page.reload();
  await expect(page.getByTestId(`recommendation-card-${job.id}`)).toContainText("82%");
  expect(analyzeCalls).toBe(1);
  expect(applicationCalls).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("job-ai-match-result.png"), fullPage: true });
});
