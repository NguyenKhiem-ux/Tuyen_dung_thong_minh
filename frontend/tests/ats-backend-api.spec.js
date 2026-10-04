import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const apiURL = process.env.TEST_API_URL || "http://127.0.0.1:8000";
const dbPath = fileURLToPath(new URL("../../backend/smart_recruitment.db", import.meta.url));

function runPython(script, ...args) {
  return execFileSync("python", ["-c", script, dbPath, ...args], { encoding: "utf8" }).trim();
}

function createTestApplications() {
  return JSON.parse(runPython(`
import json, sqlite3, sys
from datetime import datetime, timezone
db = sys.argv[1]
con = sqlite3.connect(db)
marker = "ATS integration test"
old_ids = [row[0] for row in con.execute("select id from applications where explanation=?", (marker,))]
if old_ids:
    placeholders = ",".join("?" for _ in old_ids)
    con.execute(f"delete from application_status_history where application_id in ({placeholders})", old_ids)
    con.execute(f"delete from applications where id in ({placeholders})", old_ids)
candidate_id = con.execute("select id from users where email='candidate1@demo.ai'").fetchone()[0]
resume_id = con.execute("select id from resumes where candidate_id=? order by created_at desc", (candidate_id,)).fetchone()[0]
recruiter1 = con.execute("select id from users where email='recruiter1@demo.ai'").fetchone()[0]
recruiter2 = con.execute("select id from users where email='recruiter2@demo.ai'").fetchone()[0]
job1 = con.execute("select id from jobs where recruiter_id=? order by id", (recruiter1,)).fetchone()[0]
job2 = con.execute("select id from jobs where recruiter_id=? order by id", (recruiter2,)).fetchone()[0]
now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(" ")
ids = []
for job_id, status in [(job1, "screening"), (job2, "applied"), (job2, "applied"), (job2, "applied")]:
    cursor = con.execute(
        "insert into applications (candidate_id, job_id, resume_id, status, skill_score, experience_score, semantic_score, project_score, final_score, missing_skills, explanation, created_at, updated_at) values (?, ?, ?, ?, 0, 0, 0, 0, 0, '', ?, ?, ?)",
        (candidate_id, job_id, resume_id, status, marker, now, now),
    )
    ids.append(cursor.lastrowid)
con.commit()
print(json.dumps(ids))
`));
}

function cleanupTestApplications(ids) {
  runPython(`
import sqlite3, sys
db, ids = sys.argv[1], [int(value) for value in sys.argv[2].split(",")]
con = sqlite3.connect(db)
if ids:
    placeholders = ",".join("?" for _ in ids)
    con.execute(f"delete from application_status_history where application_id in ({placeholders})", ids)
    con.execute(f"delete from applications where id in ({placeholders})", ids)
con.commit()
`, ids.join(","));
}

async function login(request, email) {
  const response = await request.post(`${apiURL}/api/auth/login`, {
    data: { email, password: "Password123" },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test("real ATS API enforces transitions, ownership, roles and history", async ({ request }) => {
  const recruiter1 = await login(request, "recruiter1@demo.ai");
  const recruiter2 = await login(request, "recruiter2@demo.ai");
  const candidate = await login(request, "candidate1@demo.ai");
  const [screening, pipeline, invalid, terminal] = createTestApplications();
  const patch = (token, applicationId, status, reason = "") => request.patch(
    `${apiURL}/api/applications/${applicationId}/status`,
    { headers: auth(token), data: { status, reason } },
  );

  try {
    for (const status of ["screening", "interview", "offer", "hired"]) {
      const response = await patch(recruiter2, pipeline, status);
      expect(response.status()).toBe(200);
      expect((await response.json()).status).toBe(status);
    }

    const rejected = await patch(recruiter1, screening, "rejected", "Không đáp ứng yêu cầu kỹ thuật");
    expect(rejected.status()).toBe(200);
    expect((await patch(recruiter2, invalid, "hired")).status()).toBe(409);
    expect((await patch(recruiter2, terminal, "rejected", "Không phù hợp")).status()).toBe(200);
    expect((await patch(recruiter2, terminal, "interview")).status()).toBe(409);
    expect((await patch(recruiter1, invalid, "screening")).status()).toBe(404);
    expect((await patch(candidate, invalid, "screening")).status()).toBe(403);

    const pipelineHistoryResponse = await request.get(`${apiURL}/api/applications/${pipeline}/history`, { headers: auth(recruiter2) });
    expect(pipelineHistoryResponse.status()).toBe(200);
    const pipelineHistory = await pipelineHistoryResponse.json();
    expect(pipelineHistory).toHaveLength(4);
    expect(pipelineHistory.map((item) => [item.old_status, item.new_status])).toEqual([
      ["applied", "screening"],
      ["screening", "interview"],
      ["interview", "offer"],
      ["offer", "hired"],
    ]);
    expect(pipelineHistory.every((item) => item.changed_by_name)).toBeTruthy();

    const screeningHistory = await (await request.get(
      `${apiURL}/api/applications/${screening}/history`,
      { headers: auth(recruiter1) },
    )).json();
    const terminalHistory = await (await request.get(
      `${apiURL}/api/applications/${terminal}/history`,
      { headers: auth(recruiter2) },
    )).json();
    const invalidHistory = await (await request.get(
      `${apiURL}/api/applications/${invalid}/history`,
      { headers: auth(recruiter2) },
    )).json();
    expect(screeningHistory).toHaveLength(1);
    expect(screeningHistory[0].reason).toBe("Không đáp ứng yêu cầu kỹ thuật");
    expect(terminalHistory).toHaveLength(1);
    expect(invalidHistory).toHaveLength(0);
    expect((await request.get(`${apiURL}/api/applications/${pipeline}/history`, { headers: auth(recruiter1) })).status()).toBe(404);
    expect((await request.get(`${apiURL}/api/applications/${pipeline}/history`, { headers: auth(candidate) })).status()).toBe(403);
  } finally {
    cleanupTestApplications([screening, pipeline, invalid, terminal]);
  }
});
