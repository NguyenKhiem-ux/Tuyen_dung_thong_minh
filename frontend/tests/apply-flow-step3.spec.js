import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const apiURL = process.env.TEST_API_URL || "http://127.0.0.1:8000";
const dbPath = fileURLToPath(new URL("../../backend/smart_recruitment.db", import.meta.url));

function runPython(script, ...args) {
  return execFileSync("python", ["-c", script, dbPath, ...args], { encoding: "utf8" }).trim();
}

function cleanupUser(email) {
  runPython(
    `
import sqlite3, sys
db, email = sys.argv[1], sys.argv[2]
con = sqlite3.connect(db)
cur = con.cursor()
ids = [row[0] for row in cur.execute("select id from users where email=?", (email,))]
for user_id in ids:
    cur.execute("delete from applications where candidate_id=?", (user_id,))
    cur.execute("delete from resumes where candidate_id=?", (user_id,))
cur.execute("delete from users where email=?", (email,))
con.commit()
`,
    email,
  );
}

function candidateId(email) {
  return runPython(
    `
import sqlite3, sys
db, email = sys.argv[1], sys.argv[2]
row = sqlite3.connect(db).execute("select id from users where email=?", (email,)).fetchone()
print(row[0] if row else "")
`,
    email,
  );
}

function insertResume(userId) {
  runPython(
    `
import sqlite3, sys
db, user_id = sys.argv[1], int(sys.argv[2])
con = sqlite3.connect(db)
con.execute(
    "insert into resumes (candidate_id, filename, raw_text, skills, experience_years, education, projects, summary, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    (user_id, "step3_cv.docx", "Python FastAPI SQL Docker Git backend developer with REST API projects.", "python, fastapi, sql, docker, git", 3, "Computer Science", "Recruitment API", "Test CV for apply flow"),
)
con.commit()
`,
    String(userId),
  );
}

function setJobStatus(jobId, status) {
  return runPython(
    `
import sqlite3, sys
db, job_id, status = sys.argv[1], int(sys.argv[2]), sys.argv[3]
con = sqlite3.connect(db)
cur = con.cursor()
row = cur.execute("select status from jobs where id=?", (job_id,)).fetchone()
if row:
    cur.execute("update jobs set status=? where id=?", (status, job_id))
    con.commit()
    print(row[0])
`,
    String(jobId),
    status,
  );
}

async function login(page, email, password) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator(".auth-form").getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem("sra_token"));
}

test("guest login redirect and candidate apply flow use the real backend", async ({ page, request }) => {
  const suffix = Date.now();
  const email = `step3-${suffix}@demo.ai`;
  const password = "Password123";
  let originalJobStatus = "";
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const jobs = await (await request.get(`${apiURL}/api/jobs`, { params: { status: "open" } })).json();
  expect(jobs.length).toBeGreaterThan(0);
  const job = jobs[0];

  try {
    cleanupUser(email);
    const register = await request.post(`${apiURL}/api/auth/register`, {
      data: { email, password, full_name: "Step Three Candidate", role: "candidate" },
    });
    expect(register.ok()).toBeTruthy();

    await page.goto(`/jobs/${job.id}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Ứng tuyển ngay" }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=.*jobs.*${job.id}`));

    await login(page, email, password);
    await expect(page).toHaveURL(new RegExp(`/jobs/${job.id}$`));

    const missingCvResponse = page.waitForResponse((response) => response.url().includes(`/api/jobs/${job.id}/apply`));
    await page.getByRole("button", { name: "Ứng tuyển ngay" }).click();
    expect((await missingCvResponse).status()).toBe(400);
    await expect(page.getByRole("heading", { name: "Bạn chưa có CV" })).toBeVisible();
    await page.getByRole("button", { name: "Để sau" }).click();

    insertResume(candidateId(email));
    const successResponse = page.waitForResponse((response) => response.url().includes(`/api/jobs/${job.id}/apply`));
    await page.getByRole("button", { name: "Ứng tuyển ngay" }).click();
    const appliedResponse = await successResponse;
    expect(appliedResponse.status()).toBe(200);
    const result = await appliedResponse.json();
    expect(result.message).toBe("Applied successfully");
    expect(result.application_id).toEqual(expect.any(Number));
    for (const score of ["final_score", "skill_score", "experience_score", "semantic_score", "project_score"])
      expect(result.match[score]).toEqual(expect.any(Number));
    expect(result.match.missing_skills).toEqual(expect.any(Array));
    expect(result.match.explanation).toEqual(expect.any(String));
    await expect(page.getByRole("heading", { name: "Ứng tuyển thành công" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đã ứng tuyển" })).toBeDisabled();
    await page.getByRole("link", { name: "Xem đơn ứng tuyển" }).click();
    await expect(page).toHaveURL(/\/candidate\/applications$/);
    await expect(page.getByText(job.title)).toBeVisible();

    await page.goto(`/jobs/${job.id}`);
    const duplicateResponse = page.waitForResponse((response) => response.url().includes(`/api/jobs/${job.id}/apply`));
    await page.getByRole("button", { name: "Ứng tuyển ngay" }).click();
    expect((await duplicateResponse).status()).toBe(409);
    await expect(page.getByRole("heading", { name: "Bạn đã ứng tuyển công việc này." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đã ứng tuyển" })).toBeDisabled();

    originalJobStatus = setJobStatus(job.id, "closed");
    await page.goto(`/jobs/${job.id}`);
    await expect(page.getByRole("button", { name: "Đã ngừng tuyển" })).toBeDisabled();
    setJobStatus(job.id, originalJobStatus || "open");
    originalJobStatus = "";

    await page.evaluate(() => localStorage.clear());
    await page.goto("/login?redirect=https%3A%2F%2Fevil-site.example");
    await login(page, email, password);
    await expect(page).toHaveURL(/\/$/);

    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");
    await login(page, "recruiter1@demo.ai", "Password123");
    await page.goto(`/jobs/${job.id}`);
    await expect(page.getByRole("button", { name: "Chỉ ứng viên có thể ứng tuyển" })).toBeDisabled();
    expect(pageErrors).toEqual([]);
  } finally {
    if (originalJobStatus) setJobStatus(job.id, originalJobStatus);
    cleanupUser(email);
  }
});
