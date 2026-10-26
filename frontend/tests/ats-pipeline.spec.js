import { expect, test } from "@playwright/test";

test("recruiter moves candidates through the ATS pipeline and sees history", async ({ page }, testInfo) => {
  const recruiter = { id: 1, email: "recruiter@example.com", full_name: "Recruiter A", role: "recruiter" };
  const job = { id: 10, title: "Backend Developer", applicants_count: 1 };
  const secondJob = { id: 12, title: "DevOps Engineer", applicants_count: 1 };
  const application = {
    id: 11,
    job_id: job.id,
    job_title: job.title,
    candidate_id: 20,
    candidate_name: "Nguyễn Văn A",
    candidate_email: "candidate@example.com",
    status: "applied",
    final_score: 82.5,
    skill_score: 90,
    experience_score: 75,
    semantic_score: 81,
    project_score: 79,
    missing_skills: ["docker"],
    explanation: "Kỹ năng backend phù hợp với yêu cầu.",
    created_at: "2026-09-30T03:00:00Z",
  };
  const secondApplication = {
    ...application,
    id: 13,
    job_id: secondJob.id,
    job_title: secondJob.title,
    candidate_name: "Trần Thu Hà",
    candidate_email: "thuha@example.com",
    status: "hired",
    final_score: 49.6,
    skill_score: 42.9,
    experience_score: 100,
  };
  const history = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: recruiter });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: recruiter });
    if (path === "/api/stats/recruiter") {
      return route.fulfill({ json: { total_jobs: 1, open_jobs: 1, total_applications: 1, by_status: {}, average_match_score: 82.5, top_candidates: [] } });
    }
    if (path === "/api/jobs/mine") return route.fulfill({ json: [job, secondJob] });
    if (path === `/api/jobs/${job.id}/applications`) return route.fulfill({ json: [application] });
    if (path === `/api/jobs/${secondJob.id}/applications`) return route.fulfill({ json: [secondApplication] });
    if (path === `/api/applications/${application.id}/history`) return route.fulfill({ json: history });
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    if (path === "/api/interview-proposals" && request.method() === "POST") {
      const payload = request.postDataJSON();
      expect(payload.proposed_times).toHaveLength(3);
      history.push({
        id: history.length + 1,
        application_id: application.id,
        old_status: application.status,
        new_status: "interview",
        changed_by: recruiter.id,
        changed_by_name: recruiter.full_name,
        reason: "Đã gửi đề xuất thời gian phỏng vấn",
        candidate_message: payload.candidate_message || null,
        changed_at: new Date().toISOString(),
      });
      application.status = "interview";
      return route.fulfill({ json: { id: 50, application_id: application.id, status: "pending", options: [] } });
    }
    if (path === `/api/applications/${application.id}/ai-feedback`) return route.fulfill({ json: null });
    if (path === `/api/applications/${application.id}/status` && request.method() === "PATCH") {
      const payload = request.postDataJSON();
      history.push({
        id: history.length + 1,
        application_id: application.id,
        old_status: application.status,
        new_status: payload.status,
        changed_by: recruiter.id,
        changed_by_name: recruiter.full_name,
        reason: payload.reason || null,
        candidate_message: payload.candidate_message || null,
        changed_at: new Date().toISOString(),
      });
      application.status = payload.status;
      return route.fulfill({ json: application });
    }
    return route.fulfill({ status: 404, json: { detail: `Unhandled ${path}` } });
  });

  await page.goto("/recruiter/dashboard");
  await page.locator(".recruiter-nav").getByRole("link", { name: "Ứng viên & ATS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ứng viên & Pipeline tuyển dụng" })).toBeVisible();
  await expect(page.locator(".ats-column")).toHaveCount(5);
  await expect(page.locator(".ats-column-applied")).toContainText("Nguyễn Văn A");
  await expect(page.locator(".ats-column-applied")).toContainText("82.5%");
  await expect(page.locator(".ats-column-applied .ats-candidate-avatar")).toHaveText("VA");
  await expect(page.locator(".ats-column-empty")).toHaveCount(4);
  await page.getByLabel("Chọn tin tuyển dụng", { exact: true }).selectOption(String(secondJob.id));
  await expect(page.locator(".ats-column-hired")).toContainText("Trần Thu Hà");
  await expect(page.locator(".ats-column-hired")).toContainText("49.6%");
  await page.getByLabel("Chọn tin tuyển dụng", { exact: true }).selectOption(String(job.id));
  await expect(page.locator(".ats-column-applied")).toContainText("Nguyễn Văn A");
  await page.screenshot({ path: testInfo.outputPath("ats-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Chuyển sang Sàng lọc" }).click();
  await expect(page.getByRole("dialog")).toContainText("Đã ứng tuyển");
  await page.getByLabel("Ghi chú nội bộ (không bắt buộc)").fill("Điểm nội bộ: ưu tiên cao");
  await page.getByLabel("Ghi chú gửi ứng viên (không bắt buộc)").fill("Hồ sơ của bạn phù hợp với vị trí.");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.locator(".ats-column-screening")).toContainText("Nguyễn Văn A");
  await expect(page.locator(".ats-column-applied .ats-candidate-card")).toHaveCount(0);

  await page.locator(".ats-column-screening").getByRole("button", { name: "Xem chi tiết" }).click();
  await expect(page.getByRole("dialog")).toContainText("Kỹ năng backend phù hợp với yêu cầu.");
  await expect(page.getByRole("dialog")).toContainText("Đã ứng tuyển → Sàng lọc");
  await expect(page.getByRole("dialog")).toContainText("Recruiter A");
  await expect(page.getByRole("dialog")).toContainText("Điểm nội bộ: ưu tiên cao");
  await expect(page.getByRole("dialog")).toContainText("Hồ sơ của bạn phù hợp với vị trí.");
  await page.getByRole("button", { name: "Đóng" }).click();

  await page.reload();
  await page.locator(".recruiter-nav").getByRole("link", { name: "Ứng viên & ATS", exact: true }).click();
  await expect(page.locator(".ats-column-screening")).toContainText("Nguyễn Văn A");
  await page.getByRole("button", { name: "Chuyển sang Phỏng vấn" }).click();
  await page.getByLabel("Phương án 1").fill("2030-10-20T09:00");
  await page.getByLabel("Phương án 2").fill("2030-10-21T14:00");
  await page.getByLabel("Phương án 3").fill("2030-10-22T10:30");
  await page.getByLabel("Ghi chú gửi ứng viên (không bắt buộc)").fill("Vui lòng chọn một lịch phỏng vấn phù hợp.");
  await page.getByRole("button", { name: "Gửi đề xuất" }).click();
  await expect(page.locator(".ats-column-interview")).toContainText("Nguyễn Văn A");

  await page.getByRole("button", { name: "Từ chối Nguyễn Văn A" }).click();
  await expect(page.getByRole("button", { name: "Xác nhận" })).toBeDisabled();
  await page.getByLabel("Lý do từ chối").fill("Chưa phù hợp ở vòng phỏng vấn");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.locator(".ats-rejected-section")).toContainText("Nguyễn Văn A");
  await expect(page.locator(".ats-rejected-section").getByRole("button", { name: /Chuyển sang/ })).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator(".ats-board")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath("ats-mobile.png"), fullPage: true });
  expect(consoleErrors).toEqual([]);
});
