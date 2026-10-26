import { expect, test } from "@playwright/test";

test("recruiter proposes three times and candidate confirms one shared interview", async ({ page }, testInfo) => {
  const recruiter = { id: 2, email: "recruiter@example.com", full_name: "Recruiter Owner", role: "recruiter" };
  const candidate = { id: 3, email: "candidate@example.com", full_name: "Candidate Owner", role: "candidate" };
  const job = { id: 10, title: "Backend Engineer", applicants_count: 1 };
  const application = {
    id: 20,
    job_id: job.id,
    job_title: job.title,
    candidate_id: candidate.id,
    candidate_name: candidate.full_name,
    candidate_email: candidate.email,
    status: "screening",
    final_score: 86,
    skill_score: 90,
    experience_score: 82,
    semantic_score: 85,
    project_score: 84,
    missing_skills: [],
    explanation: "Strong match",
    created_at: "2026-10-10T08:00:00Z",
  };
  const history = [];
  const proposals = [];
  const interviews = [];
  const notifications = { recruiter: [], candidate: [] };
  const consoleErrors = [];
  let activeRole = "recruiter";

  function currentRole(request) {
    return request.headers().authorization?.includes("candidate-token") ? "candidate" : activeRole;
  }

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
    const role = currentRole(request);
    if (path === "/api/me") return route.fulfill({ json: role === "candidate" ? candidate : recruiter });
    if (path === "/api/stats/recruiter") {
      return route.fulfill({ json: { total_jobs: 1, open_jobs: 1, total_applications: 1, by_status: { interview: application.status === "interview" ? 1 : 0 }, average_match_score: 86, top_candidates: [] } });
    }
    if (path === "/api/stats/candidate") {
      return route.fulfill({ json: { total_applications: 1, by_status: { [application.status]: 1 }, average_match_score: 86, resumes_uploaded: 1 } });
    }
    if (path === "/api/jobs/mine") return route.fulfill({ json: [job] });
    if (path === `/api/jobs/${job.id}/applications`) return route.fulfill({ json: [application] });
    if (path === `/api/applications/${application.id}/history`) return route.fulfill({ json: history });
    if (path === "/api/interview-proposals" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body.application_id).toBe(application.id);
      expect(body.proposed_times).toHaveLength(3);
      expect(new Set(body.proposed_times).size).toBe(3);
      expect(body.proposed_times.every((value) => new Date(value) > new Date())).toBeTruthy();
      application.status = "interview";
      history.push({ id: 1, application_id: application.id, old_status: "screening", new_status: "interview", changed_by: recruiter.id, changed_by_name: recruiter.full_name, reason: "Đã gửi đề xuất thời gian phỏng vấn", changed_at: new Date().toISOString() });
      const proposal = {
        id: 30,
        application_id: application.id,
        recruiter_id: recruiter.id,
        status: "pending",
        selected_option_id: null,
        duration_minutes: body.duration_minutes,
        mode: body.mode,
        location: body.location,
        notes: body.notes,
        job_title: job.title,
        company_name: "TechNova Solutions",
        candidate_name: candidate.full_name,
        options: body.proposed_times.map((scheduled_at, index) => ({ id: 301 + index, scheduled_at })),
        created_at: new Date().toISOString(),
        confirmed_at: null,
      };
      proposals.push(proposal);
      notifications.candidate.push({ id: 1, user_id: candidate.id, type: "interview_time_selection_requested", title: "Vui lòng chọn thời gian phỏng vấn", message: "Bạn có 3 phương án thời gian.", is_read: false, created_at: new Date().toISOString() });
      return route.fulfill({ status: 200, json: proposal });
    }
    if (path === "/api/interview-proposals/me") {
      return route.fulfill({ json: role === "candidate" ? proposals.filter((item) => item.status === "pending") : [] });
    }
    if (path === "/api/recruiter/interview-proposals") {
      return route.fulfill({ json: role === "recruiter" ? proposals.filter((item) => item.status === "pending") : [] });
    }
    if (path === "/api/interview-proposals/30/confirm" && request.method() === "POST") {
      const proposal = proposals[0];
      const option = proposal.options.find((item) => item.id === request.postDataJSON().option_id);
      expect(option).toBeTruthy();
      proposal.status = "confirmed";
      proposal.selected_option_id = option.id;
      proposal.confirmed_at = new Date().toISOString();
      const interview = {
        id: 40,
        application_id: application.id,
        scheduled_at: option.scheduled_at,
        duration_minutes: proposal.duration_minutes,
        mode: proposal.mode,
        location: proposal.location,
        notes: proposal.notes,
        status: "scheduled",
        job_title: job.title,
        candidate_name: candidate.full_name,
      };
      interviews.push(interview);
      notifications.recruiter.push({ id: 2, user_id: recruiter.id, type: "interview_time_confirmed", title: "Ứng viên đã xác nhận lịch phỏng vấn", message: "Candidate Owner đã chọn lịch.", is_read: false, created_at: new Date().toISOString() });
      return route.fulfill({ json: interview });
    }
    if (path === "/api/interviews/me") return route.fulfill({ json: interviews });
    if (path === "/api/recommendations") return route.fulfill({ json: [] });
    if (path === "/api/notifications") return route.fulfill({ json: notifications[role] });
    if (path === "/api/notifications/unread-count") {
      return route.fulfill({ json: { count: notifications[role].filter((item) => !item.is_read).length } });
    }
    return route.fulfill({ status: 404, json: { detail: `Unhandled ${request.method()} ${path}` } });
  });

  await page.goto("/recruiter/dashboard");
  await page.locator(".recruiter-nav").getByRole("link", { name: "Ứng viên & ATS", exact: true }).click();
  await page.getByRole("button", { name: "Chuyển sang Phỏng vấn" }).click();
  await expect(page.getByRole("dialog")).toContainText("Đề xuất thời gian phỏng vấn");
  await page.getByLabel("Phương án 1").fill("2030-10-20T09:00");
  await page.getByLabel("Phương án 2").fill("2030-10-21T14:00");
  await page.getByLabel("Phương án 3").fill("2030-10-22T10:30");
  await page.getByLabel("Thời lượng (phút)").fill("60");
  await page.getByLabel("Địa điểm / Link").fill("https://meet.example/interview");
  await page.getByLabel("Ghi chú", { exact: true }).fill("Technical interview");
  await page.getByRole("button", { name: "Gửi đề xuất" }).click();
  await expect(page.locator(".ats-column-interview")).toContainText(candidate.full_name);
  await expect(page.getByText(`Đã gửi 3 phương án phỏng vấn cho ${candidate.full_name}.`)).toBeVisible();
  expect(application.status).toBe("interview");
  expect(history.map((item) => [item.old_status, item.new_status])).toEqual([["screening", "interview"]]);

  await page.evaluate(({ user }) => {
    localStorage.setItem("sra_token", "candidate-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: candidate });
  activeRole = "candidate";
  await page.goto("/candidate/interviews");
  await expect(page.getByRole("heading", { name: "Chờ bạn xác nhận" })).toBeVisible();
  const proposalCard = page.getByTestId("interview-proposal-30");
  await expect(proposalCard.locator('input[type="radio"]')).toHaveCount(3);
  await proposalCard.locator('input[type="radio"][value="302"]').check();
  await page.screenshot({ path: testInfo.outputPath("candidate-pending-proposal.png"), fullPage: true });
  await proposalCard.getByRole("button", { name: "Xác nhận thời gian" }).click();
  await expect(page.getByTestId("interview-proposal-30")).toHaveCount(0);
  await expect(page.getByText(job.title, { exact: true })).toBeVisible();
  expect(interviews[0].scheduled_at).toBe(proposals[0].options[1].scheduled_at);
  expect(application.status).toBe("interview");

  await page.evaluate(({ user }) => {
    localStorage.setItem("sra_token", "recruiter-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: recruiter });
  activeRole = "recruiter";
  await page.goto("/recruiter/dashboard");
  await page.locator(".recruiter-nav").getByRole("link", { name: "Lịch phỏng vấn", exact: true }).click();
  await expect(page.getByTestId("interview-40")).toContainText(candidate.full_name);
  await expect(page.getByTestId("interview-40")).toContainText(job.title);
  await page.getByLabel(/Thông báo/).click();
  await expect(page.getByText("Ứng viên đã xác nhận lịch phỏng vấn", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recruiter-confirmed-interview.png"), fullPage: true });
  expect(consoleErrors).toEqual([]);
});
