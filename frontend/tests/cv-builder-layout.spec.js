import { expect, test } from "@playwright/test";

test("CV Builder keeps a long name above the position and renders GPA", async ({ page }, testInfo) => {
  const candidate = { id: 2, email: "candidate@example.com", full_name: "Nguyễn Văn A", role: "candidate" };
  const legacyDraft = {
    id: 9,
    title: "CV draft cũ",
    template_key: "olive_sidebar",
    has_portrait: false,
    content: {
      personal: {
        full_name: "Nguyễn Thị Hoàng Anh Phương Thảo",
        desired_position: "Frontend Developer",
        email: "candidate@example.com",
        phone: "0900000000",
        address: "Hà Nội",
        birth_date: "1999-01-15",
        github: "https://github.com/example",
        linkedin: "https://linkedin.example/legacy-candidate",
        portfolio: "https://portfolio.example/legacy-candidate",
      },
      education: [{ school: "Đại học Phenikaa", major: "Công nghệ thông tin", start_date: "2021", end_date: "2025", gpa: "3.4/4.0" }],
    },
  };
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: candidate });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: candidate });
    if (path === "/api/resume-drafts") return route.fulfill({ json: [legacyDraft] });
    return route.fulfill({ json: [] });
  });

  await page.goto("/candidate/cv");
  await page.getByRole("tab", { name: "Tạo CV trực tuyến" }).click();
  await expect(page.getByLabel("Họ tên")).toHaveValue("Nguyễn Thị Hoàng Anh Phương Thảo");
  await expect(page.getByLabel("Vị trí mong muốn")).toHaveValue("Frontend Developer");
  await expect(page.getByLabel("LinkedIn")).toHaveCount(0);
  await expect(page.getByLabel("Portfolio")).toHaveCount(0);

  const educationForm = page.locator(".cv-form-section").filter({
    has: page.getByRole("heading", { name: "Học vấn" }),
  });
  await expect(educationForm.getByLabel("Mô tả")).toHaveCount(0);
  await expect(educationForm.getByLabel("Trường học")).toHaveValue("Đại học Phenikaa");
  await expect(educationForm.getByLabel("Chuyên ngành")).toHaveValue("Công nghệ thông tin");
  await expect(educationForm.getByLabel("Thời gian bắt đầu")).toHaveValue("2021");
  await expect(educationForm.getByLabel("Thời gian kết thúc")).toHaveValue("2025");
  await expect(educationForm.getByLabel("GPA")).toHaveValue("3.4/4.0");

  const name = page.locator(".cv-sheet-identity h1");
  const position = page.locator(".cv-sheet-identity h2");
  const contact = page.locator(".cv-sheet-contact");
  await expect(name).toHaveText("Nguyễn Thị Hoàng Anh Phương Thảo");
  await expect(position).toHaveText("Frontend Developer");
  await expect(page.locator(".cv-sheet-contact")).not.toContainText("LinkedIn");
  await expect(page.locator(".cv-sheet-contact")).not.toContainText("Portfolio");
  await expect(page.locator(".cv-sheet")).not.toContainText("linkedin.example");
  await expect(page.locator(".cv-sheet")).not.toContainText("portfolio.example");
  const nameBox = await name.boundingBox();
  const positionBox = await position.boundingBox();
  const contactBox = await contact.boundingBox();
  expect(positionBox.y).toBeGreaterThan(nameBox.y + nameBox.height);
  expect(contactBox.y).toBeGreaterThan(positionBox.y + positionBox.height);

  const educationPreview = page.locator(".cv-sheet-compact-entry").filter({ hasText: "Đại học Phenikaa" });
  await expect(educationPreview).toContainText("Chuyên ngành: Công nghệ thông tin");
  await expect(educationPreview).toContainText("2021 – 2025");
  await expect(educationPreview).toContainText("GPA: 3.4/4.0");
  await page.screenshot({ path: testInfo.outputPath("cv-builder-live-preview.png"), fullPage: true });
});
