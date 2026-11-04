import assert from "node:assert/strict";
import {
  CV_COLLECTIONS,
  addCVEntry,
  cvFilename,
  cvPlainText,
  descriptionBullets,
  emptyCVContent,
  normalizeCVContent,
  parseHobbies,
  parseSkills,
  removeCVEntry,
  selectCVView,
  updateCVEntry,
} from "./src/cvBuilderData.js";

const original = emptyCVContent({
  full_name: "Nguyễn Văn An",
  email: "an@example.com",
  phone: "0900000000",
});

assert.equal(original.personal.full_name, "Nguyễn Văn An");
assert.equal(original.personal.email, "an@example.com");
assert.equal(original.education[0].gpa, "");

for (const section of CV_COLLECTIONS) {
  const before = original[section].length;
  const added = addCVEntry(original, section);
  assert.equal(added[section].length, before + 1, `${section} phải thêm được một mục`);
  assert.equal(original[section].length, before, `${section} không được sửa state cũ`);
  const removed = removeCVEntry(added, section, added[section].length - 1);
  assert.equal(removed[section].length, before, `${section} phải xóa đúng mục`);
}

const withExperience = updateCVEntry(original, "experience", 0, "company", "Công ty Việt");
assert.equal(withExperience.experience[0].company, "Công ty Việt");
assert.equal(original.experience[0].company, "");

assert.deepEqual(parseSkills("Python, FastAPI\nPython, PostgreSQL"), ["Python", "FastAPI", "PostgreSQL"]);
assert.deepEqual(parseHobbies("Đọc sách, Chạy bộ\nĐọc sách"), ["Đọc sách", "Chạy bộ"]);
assert.deepEqual(descriptionBullets("- Xây dựng API\n• Tối ưu truy vấn"), ["Xây dựng API", "Tối ưu truy vấn"]);

const populated = normalizeCVContent({
  ...original,
  objective: "Xây dựng hệ thống tuyển dụng ổn định.",
  experience: [
    { company: "Công ty Việt", position: "Backend Developer", period: "2024 - nay", description: "Phát triển API." },
    { company: "", position: "", period: "", description: "" },
  ],
  skills: ["Python", "FastAPI"],
  hobbies: ["Đọc sách"],
  education: [{ school: "Đại học Phenikaa", major: "Công nghệ thông tin", start_date: "2021", end_date: "2025", gpa: "3.4/4.0", description: "Nội dung cũ phải được giữ" }],
  projects: [{ name: "Smart Recruitment AI", technologies: "FastAPI", role: "Backend", description: "AI matching" }],
  awards: [{ name: "Nhân viên xuất sắc", issuer: "Công ty Việt", period: "2025", description: "Top performer" }],
});
const view = selectCVView(populated);
assert.equal(view.experience.length, 1, "preview phải ẩn mục trống");
assert.deepEqual(view.skills, ["Python", "FastAPI"]);
assert.deepEqual(view.hobbies, ["Đọc sách"]);
assert.equal(view.awards.length, 1);
assert.equal(view.education[0].period, "2021 – 2025");
assert.equal(view.education[0].gpa, "3.4/4.0");
assert.doesNotMatch(cvPlainText(populated), /Nội dung cũ phải được giữ/);
assert.match(cvPlainText(populated), /Nguyễn Văn An/);
assert.match(cvPlainText(populated), /Smart Recruitment AI/);
assert.equal(cvFilename("CV Nguyễn Văn An 2026"), "CV-Nguyen-Van-An-2026.pdf");

const legacy = normalizeCVContent({
  personal: {
    linkedin: "https://linkedin.example/legacy-candidate",
    portfolio: "https://portfolio.example/legacy-candidate",
  },
  education: [{ school: "Đại học cũ", major: "CNTT", period: "2018 - 2022", description: "Mô tả cũ" }],
});
assert.equal(legacy.education[0].description, "Mô tả cũ", "dữ liệu mô tả cũ phải được bảo toàn");
assert.equal(legacy.personal.linkedin, "https://linkedin.example/legacy-candidate");
assert.equal(legacy.personal.portfolio, "https://portfolio.example/legacy-candidate");
assert.equal(selectCVView(legacy).education[0].period, "2018 - 2022");
assert.equal(selectCVView(legacy).education[0].gpa, undefined);
assert.deepEqual(selectCVView(legacy).contactItems, []);
assert.doesNotMatch(cvPlainText(legacy), /linkedin\.example|portfolio\.example/);

console.log("cv-builder tests passed");
