import { expect, test } from "@playwright/test";

test("recruiter tracks pending proposals and manages confirmed interviews", async ({ page }, testInfo) => {
  const recruiter = { id: 2, email: "recruiter@example.com", full_name: "Nguyen Van Tuyen", role: "recruiter" };
  const interviews = [
    { id: 101, application_id: 501, candidate_name: "Le Van An", job_title: "Backend Developer (Python/FastAPI)", scheduled_at: "2026-10-20T08:03:39Z", duration_minutes: 45, mode: "online", location: "https://meet.google.com/example", notes: "Vòng phỏng vấn kỹ thuật với team Backend.", status: "scheduled" },
    { id: 102, application_id: 502, candidate_name: "Nguyễn Thu Hà", job_title: "Frontend Developer (React)", scheduled_at: "2026-10-22T05:35:00Z", duration_minutes: 45, mode: "onsite", location: "Hà Nội", notes: "Trao đổi với quản lý sản phẩm.", status: "scheduled" },
    { id: 103, application_id: 503, candidate_name: "Phạm Gia Bảo", job_title: "Product Designer", scheduled_at: "2026-10-10T02:00:00Z", duration_minutes: 60, mode: "online", location: "Google Meet", notes: "Đã hoàn thành vòng chuyên môn.", status: "completed" },
    { id: 104, application_id: 504, candidate_name: "Trần Minh Khoa", job_title: "DevOps Engineer", scheduled_at: "2026-10-11T03:00:00Z", duration_minutes: 30, mode: "online", location: "Microsoft Teams", notes: "Ứng viên xin hủy.", status: "cancelled" },
  ];
  const proposals = [{
    id: 201,
    application_id: 601,
    recruiter_id: recruiter.id,
    status: "pending",
    selected_option_id: null,
    duration_minutes: 60,
    mode: "online",
    location: "https://meet.google.com/pending",
    notes: "Vòng 1 - Chuyên môn",
    job_title: "Fullstack Developer",
    company_name: "TechNova Solutions",
    candidate_name: "Phạm Thị Bích",
    options: [
      { id: 301, scheduled_at: "2026-10-25T02:00:00Z" },
      { id: 302, scheduled_at: "2026-10-25T07:00:00Z" },
      { id: 303, scheduled_at: "2026-10-26T03:30:00Z" },
    ],
    created_at: "2026-10-18T03:00:00Z",
    confirmed_at: null,
  }];
  const applicationStatuses = new Map([...interviews.map((item) => [item.application_id, "interview"]), [601, "interview"]]);
  const apiRequests = [];
  let notificationRequests = 0;
  const consoleErrors = [];

  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "interview-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: recruiter });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    apiRequests.push(`${request.method()} ${path}`);
    if (path === "/api/me") return route.fulfill({ json: recruiter });
    if (path === "/api/stats/recruiter") return route.fulfill({ json: { total_jobs: 0, open_jobs: 0, total_applications: 0, by_status: {}, average_match_score: 0, top_candidates: [] } });
    if (path === "/api/notifications") {
      notificationRequests += 1;
      return route.fulfill({ json: [] });
    }
    if (path === "/api/notifications/unread-count") {
      notificationRequests += 1;
      return route.fulfill({ json: { count: 0 } });
    }
    if (path === "/api/interviews/me") return route.fulfill({ json: interviews });
    if (path === "/api/recruiter/interview-proposals") return route.fulfill({ json: proposals.filter((item) => item.status === "pending") });
    const statusMatch = path.match(/^\/api\/interviews\/(\d+)\/status$/);
    if (statusMatch && request.method() === "PATCH") {
      const interview = interviews.find((item) => item.id === Number(statusMatch[1]));
      interview.status = request.postDataJSON().status;
      await new Promise((resolve) => setTimeout(resolve, 120));
      return route.fulfill({ json: interview });
    }
    return route.fulfill({ status: 404, json: { detail: `Unhandled ${path}` } });
  });

  await page.goto("/recruiter/dashboard");
  const interviewLink = page.locator(".recruiter-nav").getByRole("link", { name: "Lịch phỏng vấn", exact: true });
  await interviewLink.click();
  await expect(interviewLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Lịch phỏng vấn" })).toBeVisible();
  await expect(page.getByText("Theo dõi lịch hẹn, xác nhận thời gian phỏng vấn và quản lý các buổi phỏng vấn với ứng viên.")).toBeVisible();
  await expect(page.getByTestId("interview-pending-count")).toHaveText("1");
  await expect(page.getByTestId("interview-scheduled-count")).toHaveText("2");
  await expect(page.getByTestId("interview-completed-count")).toHaveText("1");
  await expect(page.getByTestId("interview-cancelled-count")).toHaveText("1");

  const proposal = page.getByTestId("recruiter-proposal-201");
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText("Phạm Thị Bích");
  await expect(proposal).toContainText("TechNova Solutions");
  await expect(proposal).toContainText("Chờ ứng viên chọn lịch");
  await expect(proposal.locator(".recruiter-proposal-time")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Quy trình đặt lịch" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("interviews-pending-desktop.png"), fullPage: true });

  const confirmedProposal = proposals[0];
  const selectedTime = confirmedProposal.options[1].scheduled_at;
  confirmedProposal.status = "confirmed";
  confirmedProposal.selected_option_id = confirmedProposal.options[1].id;
  interviews.push({
    id: 105,
    application_id: confirmedProposal.application_id,
    candidate_name: confirmedProposal.candidate_name,
    job_title: confirmedProposal.job_title,
    scheduled_at: selectedTime,
    duration_minutes: confirmedProposal.duration_minutes,
    mode: confirmedProposal.mode,
    location: confirmedProposal.location,
    notes: confirmedProposal.notes,
    status: "scheduled",
  });

  await page.reload();
  await page.locator(".recruiter-nav").getByRole("link", { name: "Lịch phỏng vấn", exact: true }).click();
  await expect(page.getByTestId("interview-pending-count")).toHaveText("0");
  await expect(page.getByTestId("interview-scheduled-count")).toHaveText("3");
  await expect(page.getByTestId("recruiter-proposal-201")).toHaveCount(0);
  await expect(page.getByTestId("interview-105")).toBeVisible();
  await expect(page.getByTestId("interview-105").locator("time")).toHaveAttribute("datetime", selectedTime);

  await page.getByTestId("interview-101").getByRole("button", { name: "Đánh dấu hoàn tất" }).click();
  await expect(page.getByTestId("interview-completed-count")).toHaveText("2");
  await expect(page.getByTestId("interview-scheduled-count")).toHaveText("2");
  await page.getByTestId("interview-102").getByRole("button", { name: "Hủy lịch" }).click();
  await expect(page.getByTestId("interview-cancelled-count")).toHaveText("2");
  await page.getByRole("button", { name: "Hoàn tất (2)", exact: true }).click();
  await expect(page.getByTestId("interview-101")).toBeVisible();
  await expect(page.getByTestId("interview-101").locator(".recruiter-interview-actions")).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath("interviews-mobile.png"), fullPage: true });

  expect(apiRequests).toContain("GET /api/recruiter/interview-proposals");
  expect(apiRequests.some((value) => value.includes("/api/applications/"))).toBeFalsy();
  expect([...applicationStatuses.values()].every((status) => status === "interview")).toBeTruthy();
  expect(notificationRequests).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});
