import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: node render-cv-pdf-test.mjs <output.pdf>");

const root = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { renderCVPdfBlob } = await server.ssrLoadModule("/src/components/CVPdfDocument.jsx");
  const args = process.argv.slice(3);
  const fullName = args.find((value) => value.startsWith("--name="))?.slice(7) || "Nguyễn Văn An";
  const identityOnly = args.includes("--identity-only");
  const legacyEducation = args.includes("--legacy-education");
  const experience = Array.from({ length: identityOnly ? 0 : 18 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      company: `Công ty Việt ${number}`,
      position: `Kinh-nghiệm-${number}`,
      period: "2024 - nay",
      description: `Phát triển API tuyển dụng bằng FastAPI. Kết-quả-${number}`,
    };
  });
  const content = {
    personal: {
      full_name: fullName,
      desired_position: "Frontend Developer",
      email: "an@example.com",
      phone: "0900000000",
      address: "Hà Nội",
      birth_date: "15/01/1999",
      github: "https://github.com/example",
      linkedin: "https://linkedin.example/legacy-candidate",
      portfolio: "https://portfolio.example/legacy-candidate",
    },
    objective: "Xây dựng hệ thống tuyển dụng ổn định.",
    summary: "Kinh nghiệm phát triển dịch vụ web và hệ thống AI.",
    education: legacyEducation
      ? [{ school: "Đại học Công nghệ", major: "Khoa học máy tính", period: "2018 - 2022", description: "Mô tả học vấn cũ không được hiển thị" }]
      : [{ school: "Đại học Phenikaa", major: "Công nghệ thông tin", start_date: "2021", end_date: "2025", gpa: "3.4/4.0", description: "Mô tả học vấn cũ không được hiển thị" }],
    experience,
    skills: ["Python", "FastAPI", "PostgreSQL"],
    hobbies: ["Đọc sách", "Chạy bộ"],
    projects: [{ name: "Smart Recruitment AI", technologies: "React, FastAPI", role: "Backend", description: "AI Matching v3" }],
    awards: [{ name: "Nhân viên xuất sắc", issuer: "Công ty Việt", period: "2025", description: "Dẫn dắt cải tiến tuyển dụng." }],
    certificates: [{ name: "Cloud Fundamentals", issuer: "Test Academy", period: "2025" }],
  };
  const portraitSrc = args.includes("--no-portrait")
    ? ""
    : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const blob = await renderCVPdfBlob(content, `CV ${fullName}`, {
    regular: path.join(root, "public", "fonts", "NotoSans-Regular.ttf"),
    bold: path.join(root, "public", "fonts", "NotoSans-Bold.ttf"),
  }, portraitSrc);
  await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
} finally {
  await server.close();
}
