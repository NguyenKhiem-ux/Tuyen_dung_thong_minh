import { expect, test } from "@playwright/test";

test("recruiter messages persist in the candidate application timeline", async ({ page }, testInfo) => {
  const recruiter = { id: 1, email: "recruiter@example.com", full_name: "Recruiter A", role: "recruiter" };
  const candidate = { id: 2, email: "candidate@example.com", full_name: "Candidate A", role: "candidate" };
  const job = {
    id: 10,
    title: "Backend Developer",
    company_name: "TechNova Solutions",
    location: "Hà Nội",
    employment_type: "Full-time",
    applicants_count: 1,
  };
  const application = {
    id: 11,
    job_id: job.id,
    job_title: job.title,
    candidate_id: candidate.id,
    candidate_name: candidate.full_name,
    candidate_email: candidate.email,
    status: "screening",
    final_score: 82,
    skill_score: 86,
    experience_score: 78,
    semantic_score: 84,
    project_score: 80,
    missing_skills: [],
    explanation: "Hồ sơ phù hợp.",
    created_at: "2026-10-15T03:00:00Z",
  };
  const history = [{
    id: 1,
    application_id: application.id,
    old_status: "applied",
    new_status: "screening",
    changed_by: recruiter.id,
    changed_by_name: recruiter.full_name,
    reason: "Internal priority score: 9/10",
    candidate_message: "Hồ sơ của bạn phù hợp với vị trí.",
    changed_at: "2026-10-16T03:00:00Z",
  }, {
    id: 99,
    application_id: 999,
    old_status: "applied",
    new_status: "screening",
    changed_by: recruiter.id,
    changed_by_name: recruiter.full_name,
    reason: null,
    candidate_message: "Lời nhắn của application khác.",
    changed_at: "2026-10-15T03:00:00Z",
  }];
  const notifications = [];
  let activeRole = "recruiter";
  const consoleErrors = [];

  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "recruiter-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: recruiter });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const candidateRequest = request.headers().authorization?.includes("candidate-token") || activeRole === "candidate";
    const user = candidateRequest ? candidate : recruiter;
    if (path === "/api/me") return route.fulfill({ json: user });
    if (path === "/api/stats/recruiter") return route.fulfill({ json: { total_jobs: 1, open_jobs: 1, total_applications: 1, by_status: { screening: 1 }, average_match_score: 82, top_candidates: [] } });
    if (path === "/api/stats/candidate") return route.fulfill({ json: { total_applications: 1, by_status: { screening: 1 }, average_match_score: 82, resumes_uploaded: 1 } });
    if (path === "/api/jobs/mine") return route.fulfill({ json: [job] });
    if (path === `/api/jobs/${job.id}/applications`) return route.fulfill({ json: [application] });
    if (path === `/api/jobs/${job.id}`) return route.fulfill({ json: job });
    if (path === "/api/applications/me") return route.fulfill({ json: [application] });
    if (path === "/api/interviews/me") return route.fulfill({ json: [] });
    if (path === `/api/applications/${application.id}/history`) {
      const body = candidateRequest ? history.map((item) => ({ ...item, reason: null })) : history;
      return route.fulfill({ json: body });
    }
    if (path === `/api/applications/${application.id}/messages` && request.method() === "POST") {
      const item = {
        id: 2,
        application_id: application.id,
        old_status: application.status,
        new_status: application.status,
        changed_by: recruiter.id,
        changed_by_name: recruiter.full_name,
        reason: null,
        candidate_message: request.postDataJSON().candidate_message,
        changed_at: "2026-10-18T04:30:00Z",
      };
      history.push(item);
      notifications.push({
        id: 20,
        user_id: candidate.id,
        application_id: application.id,
        type: "application_message_received",
        title: "Lời nhắn mới từ nhà tuyển dụng",
        message: item.candidate_message,
        is_read: false,
        created_at: item.changed_at,
      });
      return route.fulfill({ json: item });
    }
    if (path === "/api/notifications") return route.fulfill({ json: candidateRequest ? notifications : [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: candidateRequest ? notifications.filter((item) => !item.is_read).length : 0 } });
    if (path === "/api/notifications/20/read" && request.method() === "PATCH") {
      notifications[0].is_read = true;
      return route.fulfill({ json: notifications[0] });
    }
    return route.fulfill({ status: 404, json: { detail: `Unhandled ${request.method()} ${path}` } });
  });

  await page.goto("/recruiter/dashboard");
  await page.locator(".recruiter-nav").getByRole("link", { name: "Ứng viên & ATS", exact: true }).click();
  await page.getByRole("button", { name: "Xem chi tiết" }).click();
  await page.getByRole("button", { name: "Gửi lời nhắn" }).click();
  const messageField = page.getByLabel("Ghi chú gửi ứng viên", { exact: true });
  await messageField.fill("Chúng tôi sẽ liên hệ để sắp xếp bước tiếp theo.");
  await messageField.locator("xpath=ancestor::form").getByRole("button", { name: "Gửi lời nhắn", exact: true }).click();
  await expect(page.getByText("Đã gửi lời nhắn cho ứng viên.")).toBeVisible();
  expect(application.status).toBe("screening");

  await page.evaluate(({ user }) => {
    localStorage.setItem("sra_token", "candidate-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: candidate });
  activeRole = "candidate";
  await page.goto("/candidate");
  await page.getByLabel(/Thông báo/).click();
  await page.getByText("Lời nhắn mới từ nhà tuyển dụng", { exact: true }).click();
  await expect(page).toHaveURL(`/candidate/applications?application=${application.id}`);
  const applicationCard = page.locator(`#application-${application.id}`);
  await expect(applicationCard).toBeVisible();
  await expect(page.locator(".application-message")).toHaveCount(2);
  const messages = applicationCard.getByRole("region", { name: "Lời nhắn từ nhà tuyển dụng" });
  await expect(messages.getByRole("heading", { name: "Lời nhắn từ nhà tuyển dụng", exact: true })).toBeVisible();
  await expect(applicationCard.locator(":scope > .application-timeline + .application-messages + .application-panels")).toHaveCount(1);
  await expect(messages.getByText("Hồ sơ của bạn phù hợp với vị trí.", { exact: true })).toBeVisible();
  await expect(messages.getByText("Chúng tôi sẽ liên hệ để sắp xếp bước tiếp theo.", { exact: true })).toBeVisible();
  await expect(messages.locator(".application-message").nth(0)).toContainText("Cập nhật trạng thái");
  await expect(messages.locator(".application-message").nth(1)).toContainText("Lời nhắn ở trạng thái hiện tại");
  await expect(page.getByText("Internal priority score: 9/10", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Lời nhắn của application khác.", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".application-message")).toHaveCount(2);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath("candidate-application-messages-mobile.png"), fullPage: true });
  expect(consoleErrors).toEqual([]);
});
