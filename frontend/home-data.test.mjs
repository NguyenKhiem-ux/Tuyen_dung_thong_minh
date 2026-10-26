import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const m = await server.ssrLoadModule("/src/homeData.js");
  const now = Date.parse("2026-10-17T12:00:00Z");
  const job = (id, extra) => ({ id, title: "T", skills: "", description: "", location: "Hà Nội", applicants_count: 0, created_at: "2026-10-17T09:00:00", company_id: 1, company_name: "A", ...extra });

  // created_at của backend là UTC không có múi giờ: phải hiểu là UTC.
  assert.equal(m.jobAgeInDays(job(1), now), 0);
  assert.equal(m.postedLabel(job(1), now), "Đăng hôm nay");
  assert.equal(m.postedLabel(job(1, { created_at: "2026-10-10T09:00:00" }), now), "Đăng 7 ngày trước");
  assert.equal(m.isNewJob(job(1, { created_at: "2026-10-10T09:00:00" }), now), false);
  assert.equal(m.isRemoteJob(job(1, { location: "Remote" })), true);

  const jobs = [
    job(1, { applicants_count: 5, title: "Backend Developer" }),
    job(2, { applicants_count: 1, location: "Remote", company_id: 2, company_name: "B", title: "Data Analyst" }),
    job(3, { applicants_count: 2, created_at: "2026-09-01T09:00:00" }),
  ];
  assert.deepEqual(m.marketStats(jobs, now), { openJobs: 3, companies: 2, newThisWeek: 2, applications: 8 });
  assert.deepEqual([...m.hotJobIds(jobs)].sort(), [1, 3]); // 1 ứng viên thì không "hot"
  assert.deepEqual(m.featuredJobs(jobs, "remote").map((j) => j.id), [2]);
  assert.deepEqual(m.topLocations(jobs, 4), ["Hà Nội", "Remote"]);
  const companies = m.companySummaries(jobs);
  assert.deepEqual(companies.map((c) => [c.name, c.jobs]), [["A", 2], ["B", 1]]);
  // Số liệu danh mục dùng cùng quy tắc với API tìm kiếm, nên khớp kết quả khi bấm vào.
  const cats = m.categoryCounts(jobs);
  assert.deepEqual(cats.map((c) => [c.key, c.count]), [["developer", 1], ["data", 1]]);
  assert.deepEqual(m.marketStats([]), { openJobs: 0, companies: 0, newThisWeek: 0, applications: 0 });
  console.log("home-data tests passed");
} finally {
  await server.close();
}
