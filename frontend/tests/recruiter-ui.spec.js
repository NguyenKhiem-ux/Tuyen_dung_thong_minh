import { test, expect } from "@playwright/test";

const recruiter = {
  id: 2,
  email: "recruiter1@demo.ai",
  full_name: "Nguyễn Minh Anh",
  role: "recruiter",
};

const stats = {
  total_jobs: 8,
  open_jobs: 5,
  total_applications: 34,
  average_match_score: 78.6,
  by_status: { applied: 16, screening: 9, interview: 6, hired: 3 },
  top_candidates: [
    { candidate_name: "Lê Hoàng Nam", job_title: "Frontend Developer", final_score: 82.5 },
    { candidate_name: "Trần Thu Hà", job_title: "Product Designer", final_score: 94 },
    { candidate_name: "Phạm Gia Bảo", job_title: "Backend Developer", final_score: 88.2 },
  ],
};

test("recruiter dashboard matches the new header and statistics layout", async ({ page }, testInfo) => {
  const errors = [];
  let company = {
    name: "TechNova Solutions",
    description: "Công ty phát triển phần mềm và AI cho doanh nghiệp.",
    website: "https://technova.example.com",
    location: "Hà Nội",
    industry: "Software",
  };
  let createdJobId = null;
  let jobs = [
    { id: 11, title: "Frontend Developer", description: "React", skills: "react", min_experience: 2, location: "Remote", employment_type: "Full-time", salary_range: "", status: "open", applicants_count: 8, created_at: "2026-10-10T08:00:00Z" },
    { id: 12, title: "Backend Developer", description: "Python", skills: "python", min_experience: 3, location: "Hà Nội", employment_type: "Full-time", salary_range: "", status: "open", applicants_count: 5, created_at: "2026-10-08T08:00:00Z" },
    { id: 13, title: "DevOps Engineer", description: "Cloud", skills: "docker", min_experience: 2, location: "TP. Hồ Chí Minh", employment_type: "Full-time", salary_range: "", status: "closed", applicants_count: 3, created_at: "2026-10-05T08:00:00Z" },
    { id: 14, title: "Product Designer", description: "Design systems", skills: "figma", min_experience: 2, location: "Đà Nẵng", employment_type: "Hybrid", salary_range: "", status: "open", applicants_count: 4, created_at: "2026-10-02T08:00:00Z" },
  ];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: recruiter });
    if (path === "/api/stats/recruiter") return route.fulfill({ json: stats });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 1 } });
    if (path === "/api/notifications") {
      return route.fulfill({
        json: [
          {
            id: 1,
            title: "Ứng viên mới",
            message: "Bạn vừa nhận một hồ sơ mới.",
            type: "application_received",
            is_read: false,
            created_at: "2026-10-09T08:00:00Z",
          },
        ],
      });
    }
    if (path === "/api/company/me") {
      if (route.request().method() === "PUT") company = route.request().postDataJSON();
      return route.fulfill({ json: company });
    }
    if (path === "/api/jobs/mine") return route.fulfill({ json: jobs });
    if (path === "/api/jobs" && route.request().method() === "POST") {
      createdJobId = 15;
      const created = {
        ...route.request().postDataJSON(),
        id: createdJobId,
        status: "open",
        applicants_count: 0,
        created_at: "2026-10-13T08:00:00Z",
      };
      jobs = [created, ...jobs];
      return route.fulfill({ status: 201, json: created });
    }
    const jobMatch = path.match(/^\/api\/jobs\/(\d+)$/);
    if (jobMatch && route.request().method() === "PUT") {
      const id = Number(jobMatch[1]);
      const update = route.request().postDataJSON();
      jobs = jobs.map((job) => (job.id === id ? { ...job, ...update } : job));
      return route.fulfill({ json: jobs.find((job) => job.id === id) });
    }
    if (jobMatch && route.request().method() === "DELETE") {
      jobs = jobs.filter((job) => job.id !== Number(jobMatch[1]));
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "browser-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: recruiter });

  await page.goto("/recruiter/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Bảng điều khiển Nhà tuyển dụng" })).toBeVisible();
  await expect(page.locator(".recruiter-nav a")).toHaveCount(5);
  await expect(page.locator(".dashboard > .tabs")).toHaveCount(0);
  await expect(page.locator('[data-testid="recruiter-total-jobs"]')).toHaveText("8");
  await expect(page.locator('[data-testid="recruiter-total-applications"]')).toHaveText("34");
  await expect(page.locator(".recruiter-candidate-row").nth(0)).toContainText("Trần Thu Hà");
  await expect(page.locator(".recruiter-candidate-row").nth(1)).toContainText("Phạm Gia Bảo");
  await expect(page.locator(".recruiter-candidate-row").nth(2)).toContainText("Lê Hoàng Nam");
  await expect(page.getByLabel("Điểm phù hợp của Trần Thu Hà")).toHaveAttribute("aria-valuenow", "94");
  await expect(page.getByLabel(/^Thông báo/)).toBeVisible();
  await expect(page.locator(".site-user-menu summary")).toBeVisible();

  const navItems = [
    ["Công ty", "company"],
    ["Tin tuyển dụng", "jobs"],
    ["Ứng viên & ATS", "applications"],
    ["Lịch phỏng vấn", "interviews"],
    ["Thống kê", "overview"],
  ];
  for (const [label, tab] of navItems) {
    const link = page.locator(".recruiter-nav").getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page.locator(".recruiter-dashboard")).toHaveAttribute("data-active-tab", tab);
    await expect(link).toHaveAttribute("aria-current", "page");
  }

  await page.screenshot({ path: testInfo.outputPath("recruiter-dashboard.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở menu" }).click();
  await expect(page.locator(".recruiter-nav")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(page.locator(".recruiter-stat-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Đóng menu" }).click();
  await page.screenshot({ path: testInfo.outputPath("recruiter-dashboard-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  const companyLink = page.locator(".recruiter-nav").getByRole("link", { name: "Công ty", exact: true });
  await companyLink.click();
  await expect(companyLink).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".dashboard > .tabs")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Thông tin công ty" })).toBeVisible();
  await expect(page.getByLabel("Tên công ty", { exact: true })).toHaveValue("TechNova Solutions");
  await expect(page.getByLabel("Website", { exact: true })).toHaveValue("https://technova.example.com");
  await expect(page.getByLabel("Địa điểm", { exact: true })).toHaveValue("Hà Nội");
  await expect(page.getByLabel("Lĩnh vực", { exact: true })).toHaveValue("Software");

  await page.getByLabel("Tên công ty", { exact: true }).fill("TechNova AI Solutions");
  await expect(page.getByTestId("company-preview-name")).toHaveText("TechNova AI Solutions");
  await expect(page.locator(".recruiter-company-preview")).toContainText(company.description);
  await expect(page.locator(".recruiter-company-preview")).toContainText(company.website);
  await expect(page.locator(".recruiter-company-preview")).toContainText(company.location);
  await expect(page.locator(".recruiter-company-preview")).toContainText(company.industry);
  await page.getByRole("button", { name: "Lưu thông tin", exact: true }).click();
  await expect(page.getByText("Đã lưu thông tin công ty.", { exact: true })).toBeVisible();

  await page.reload();
  await page.locator(".recruiter-nav").getByRole("link", { name: "Công ty", exact: true }).click();
  await expect(page.getByLabel("Tên công ty", { exact: true })).toHaveValue("TechNova AI Solutions");
  await page.screenshot({ path: testInfo.outputPath("recruiter-company.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(page.locator(".recruiter-company-layout")).toHaveCSS("grid-template-columns", "362px");
  await page.screenshot({ path: testInfo.outputPath("recruiter-company-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  const jobsLink = page.locator(".recruiter-nav").getByRole("link", { name: "Tin tuyển dụng", exact: true });
  await jobsLink.click();
  await expect(jobsLink).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".dashboard > .tabs")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Tin tuyển dụng" })).toBeVisible();
  await expect(page.locator(".recruiter-current-job")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("recruiter-jobs.png"), fullPage: true });

  await page.getByRole("button", { name: "Xem tất cả", exact: false }).click();
  await expect(page.locator(".recruiter-current-job")).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(page.locator(".recruiter-jobs-layout")).toHaveCSS("grid-template-columns", "362px");
  await page.screenshot({ path: testInfo.outputPath("recruiter-jobs-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Chức danh", { exact: true }).fill("QA Automation Engineer");
  await page.getByLabel("Mô tả công việc", { exact: true }).fill("Xây dựng và duy trì kiểm thử tự động.");
  await page.getByLabel("Kỹ năng yêu cầu (phân cách bởi dấu phẩy)", { exact: true }).fill("playwright, javascript");
  await page.getByLabel("Kinh nghiệm tối thiểu (năm)", { exact: true }).fill("2");
  await page.getByLabel("Địa điểm", { exact: true }).fill("Đà Nẵng");
  await page.getByLabel("Hình thức", { exact: true }).fill("Full-time");
  await page.getByLabel("Mức lương", { exact: true }).fill("20-30 triệu");
  await page.getByRole("button", { name: "Đăng tin", exact: true }).click();
  await expect(page.getByText("Đã đăng tin tuyển dụng mới.", { exact: true })).toBeVisible();
  await expect(page.getByTestId(`recruiter-job-${createdJobId}`)).toContainText("QA Automation Engineer");

  await page.reload();
  await page.locator(".recruiter-nav").getByRole("link", { name: "Tin tuyển dụng", exact: true }).click();
  await expect(page.getByTestId(`recruiter-job-${createdJobId}`)).toContainText("QA Automation Engineer");
  await page.getByTestId(`recruiter-job-${createdJobId}`).getByRole("button", { name: "Sửa", exact: true }).click();
  await page.getByLabel("Chức danh", { exact: true }).fill("Senior QA Automation Engineer");
  await page.getByRole("button", { name: "Cập nhật", exact: true }).click();
  await expect(page.getByTestId(`recruiter-job-${createdJobId}`)).toContainText("Senior QA Automation Engineer");
  await page.getByTestId(`recruiter-job-${createdJobId}`).getByRole("button", { name: "Đóng tin", exact: true }).click();
  await expect(page.getByTestId(`recruiter-job-${createdJobId}`)).toContainText("Đã đóng");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId(`recruiter-job-${createdJobId}`).getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(page.getByTestId(`recruiter-job-${createdJobId}`)).toHaveCount(0);
  expect(errors).toEqual([]);
});
