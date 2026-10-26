import { expect, test } from "@playwright/test";

function watchConsole(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function signIn(page, user) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user });
}

test("candidate sees CV quality tips and evidence behind AI recommendations", async ({ page }) => {
  const candidate = { id: 2, email: "c@example.com", full_name: "Le Van An", role: "candidate" };
  const errors = watchConsole(page);
  await signIn(page, candidate);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: candidate });
    if (path === "/api/resumes/me") {
      return route.fulfill({ json: [{ id: 5, filename: "cv.pdf", skills: ["python", "docker"], experience_years: 3, education: [], projects: [], summary: "ok", created_at: "2026-10-01T03:00:00Z" }] });
    }
    if (path === "/api/resumes/me/insights") {
      return route.fulfill({ json: { quality_score: 58, skills: ["python"], experience_years: 3, engine_version: "3.0", tips: [
        { code: "short_text", severity: "high", message: "CV quá ngắn. Hãy bổ sung mô tả công việc." },
        { code: "no_metrics", severity: "medium", message: "Chưa có con số thể hiện thành tích." },
      ] } });
    }
    if (path === "/api/recommendations") {
      return route.fulfill({ json: [{
        job: { id: 7, title: "Backend Developer", company_name: "ACME", location: "Remote", description: "API", skills: "python", employment_type: "Full-time" },
        final_score: 71.5, skill_score: 80, missing_skills: ["kubernetes"], preferred_skills: ["kubernetes"],
        matched_skills: ["python"], partial_skills: ["vue (tương đương react)"],
        evidence: { python: "…3 years of experience with Python, FastAPI…" },
        explanation: "Phù hợp 71.5%.",
      }] });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/candidate/cv");
  await expect(page.locator(".resume-quality-score")).toHaveText("58/100");
  await expect(page.locator(".resume-tip-list li")).toHaveCount(2);
  await expect(page.locator(".tip-severity.high")).toHaveText("Quan trọng");

  await page.goto("/candidate/recommendations");
  await expect(page.locator(".matched-skills")).toContainText("python");
  await expect(page.locator(".partial-skills")).toContainText("vue (tương đương react)");
  await expect(page.locator(".missing-skills")).toContainText("kubernetes (ưu tiên)");
  await page.locator(".ai-evidence summary").click();
  await expect(page.locator(".ai-evidence")).toContainText("3 years of experience with Python");
  expect(errors).toEqual([]);
});

test("recruiter rates the AI score and the choice is saved", async ({ page }) => {
  const recruiter = { id: 1, email: "r@example.com", full_name: "Recruiter A", role: "recruiter" };
  const job = { id: 10, title: "Backend Developer", applicants_count: 1 };
  const application = {
    id: 11, job_id: 10, job_title: "Backend Developer", candidate_id: 20, candidate_name: "Nguyễn Văn A",
    candidate_email: "a@example.com", status: "screening", final_score: 82.5, skill_score: 90, experience_score: 75,
    semantic_score: 81, project_score: 79, missing_skills: [], explanation: "Phù hợp.", created_at: "2026-09-30T03:00:00Z",
  };
  let saved = null;
  const errors = watchConsole(page);
  await signIn(page, recruiter);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: recruiter });
    if (path === "/api/stats/recruiter") return route.fulfill({ json: { total_jobs: 1, open_jobs: 1, total_applications: 1, by_status: {}, average_match_score: 82.5, top_candidates: [] } });
    if (path === "/api/jobs/mine") return route.fulfill({ json: [job] });
    if (path === "/api/jobs/10/applications") return route.fulfill({ json: [application] });
    if (path === "/api/applications/11/history") return route.fulfill({ json: [] });
    if (path === "/api/applications/11/ai-feedback") {
      if (request.method() === "PUT") {
        saved = request.postDataJSON();
        return route.fulfill({ json: { application_id: 11, ...saved, score_snapshot: 82.5, updated_at: "2026-10-20T03:00:00Z" } });
      }
      return route.fulfill({ json: saved ? { application_id: 11, ...saved, score_snapshot: 82.5, updated_at: "2026-10-20T03:00:00Z" } : null });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/recruiter/dashboard");
  await page.getByRole("link", { name: "Ứng viên & ATS" }).click();
  await page.getByRole("button", { name: "Xem chi tiết" }).click();
  await page.getByLabel("Ghi chú cho phản hồi AI").fill("Thiếu kinh nghiệm thực tế");
  await page.getByRole("button", { name: "AI chấm quá cao" }).click();
  await expect(page.locator(".ai-feedback-status")).toContainText("Đã ghi nhận");
  expect(saved).toEqual({ label: "too_high", note: "Thiếu kinh nghiệm thực tế" });
  await expect(page.getByRole("button", { name: "AI chấm quá cao" })).toHaveAttribute("aria-pressed", "true");

  // mở lại cửa sổ: lựa chọn đã lưu được nạp lại
  await page.getByRole("button", { name: "Đóng" }).click();
  await page.getByRole("button", { name: "Xem chi tiết" }).click();
  await expect(page.getByRole("button", { name: "AI chấm quá cao" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Ghi chú cho phản hồi AI")).toHaveValue("Thiếu kinh nghiệm thực tế");
  expect(errors).toEqual([]);
});

test("job form explains how to mark preferred skills", async ({ page }) => {
  const recruiter = { id: 1, email: "r@example.com", full_name: "Recruiter A", role: "recruiter" };
  await signIn(page, recruiter);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: recruiter });
    return route.fulfill({ json: path.endsWith("/stats/recruiter") ? { total_jobs: 0, open_jobs: 0, total_applications: 0, by_status: {}, average_match_score: 0, top_candidates: [] } : [] });
  });
  await page.goto("/recruiter/dashboard");
  await page.getByRole("link", { name: "Tin tuyển dụng" }).click();
  await page.getByRole("button", { name: /Đăng tin|Tạo tin|Thêm/ }).first().click();
  await expect(page.locator(".field-hint")).toContainText("(ưu tiên)");
});
