// Hàm thuần phục vụ trang chủ. Mọi số liệu đều được tính từ danh sách việc làm
// thật do API trả về; không có dữ liệu giả hay con số cố định.

const DAY = 24 * 60 * 60 * 1000;

// Backend trả datetime UTC không kèm múi giờ ("2026-10-17T09:00:00"). Nếu không
// gắn "Z", trình duyệt hiểu là giờ địa phương và làm lệch nhãn "mới/hôm nay".
export function parseJobDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function jobAgeInDays(job, now = Date.now()) {
  const date = parseJobDate(job?.created_at);
  return date ? Math.max(0, Math.floor((now - date.getTime()) / DAY)) : null;
}

export function postedLabel(job, now = Date.now()) {
  const days = jobAgeInDays(job, now);
  if (days === null) return "";
  if (days === 0) return "Đăng hôm nay";
  if (days < 30) return `Đăng ${days} ngày trước`;
  const months = Math.floor(days / 30);
  return months < 12 ? `Đăng ${months} tháng trước` : "Đăng hơn 1 năm trước";
}

export function isNewJob(job, now = Date.now(), withinDays = 3) {
  const days = jobAgeInDays(job, now);
  return days !== null && days < withinDays;
}

export function isRemoteJob(job) {
  return /\bremote\b/i.test(job?.location || "");
}

function companyKey(job) {
  if (job.company_id != null) return `id:${job.company_id}`;
  const name = job.company_name?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

export function marketStats(jobs, now = Date.now()) {
  const companies = new Set(jobs.map(companyKey).filter(Boolean));
  return {
    openJobs: jobs.length,
    companies: companies.size,
    newThisWeek: jobs.filter((job) => {
      const days = jobAgeInDays(job, now);
      return days !== null && days < 7;
    }).length,
    applications: jobs.reduce((sum, job) => sum + (Number(job.applicants_count) || 0), 0),
  };
}

export function featuredJobs(jobs, location = "", limit = 6) {
  const wanted = location.trim().toLowerCase();
  return [...jobs]
    .filter((job) => !wanted || (job.location || "").trim().toLowerCase() === wanted)
    .sort(
      (a, b) =>
        (b.applicants_count || 0) - (a.applicants_count || 0) ||
        (parseJobDate(b.created_at) || 0) - (parseJobDate(a.created_at) || 0),
    )
    .slice(0, limit);
}

// "Hot" = thuộc nhóm nhiều ứng viên nhất và có từ 2 lượt ứng tuyển trở lên, để
// nhãn không xuất hiện đồng loạt khi các việc làm chỉ có 0-1 ứng viên.
export const HOT_MIN_APPLICANTS = 2;
export function hotJobIds(jobs, limit = 3) {
  return new Set(
    featuredJobs(jobs, "", limit)
      .filter((job) => (job.applicants_count || 0) >= HOT_MIN_APPLICANTS)
      .map((job) => job.id),
  );
}

export function topLocations(jobs, limit = 4) {
  const counts = new Map();
  for (const job of jobs) {
    const name = job.location?.trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
    .slice(0, limit)
    .map(([name]) => name);
}

export function companySummaries(jobs, limit = 6) {
  const groups = new Map();
  for (const job of jobs) {
    const key = companyKey(job);
    if (!key || !job.company_name?.trim()) continue;
    const group = groups.get(key) || { key, name: job.company_name.trim(), sample: job, jobs: 0, applicants: 0, locations: new Set() };
    group.jobs += 1;
    group.applicants += job.applicants_count || 0;
    if (job.location?.trim()) group.locations.add(job.location.trim());
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.jobs - a.jobs || b.applicants - a.applicants || a.name.localeCompare(b.name, "vi"))
    .slice(0, limit)
    .map((group) => ({ ...group, locations: [...group.locations] }));
}

// Mỗi danh mục dùng đúng một từ khóa tìm kiếm. Số lượng được đếm bằng cùng quy
// tắc với API (`GET /api/jobs?q=`: tiêu đề, kỹ năng, mô tả, tên công ty), nên con
// số hiển thị luôn bằng số kết quả khi người dùng bấm vào.
export const JOB_CATEGORIES = [
  { key: "developer", label: "Lập trình & Phần mềm", q: "Developer" },
  { key: "data", label: "Phân tích dữ liệu", q: "Data Analyst" },
  { key: "ai", label: "AI & Machine Learning", q: "Machine Learning" },
  { key: "product", label: "Quản lý sản phẩm", q: "Product Manager" },
  { key: "design", label: "Thiết kế UI/UX", q: "Designer" },
  { key: "marketing", label: "Marketing & Truyền thông", q: "Marketing" },
];

export function jobMatchesQuery(job, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [job.title, job.skills, job.description, job.company_name].some((field) =>
    String(field || "")
      .toLowerCase()
      .includes(needle),
  );
}

export function categoryCounts(jobs, categories = JOB_CATEGORIES) {
  return categories
    .map((category) => ({ ...category, count: jobs.filter((job) => jobMatchesQuery(job, category.q)).length }))
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count);
}
