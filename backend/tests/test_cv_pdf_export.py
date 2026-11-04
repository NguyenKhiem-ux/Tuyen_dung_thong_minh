import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import fitz


class CVPdfExportTests(unittest.TestCase):
    def test_pdf_is_a4_paginated_and_vietnamese_text_is_extractable(self):
        node = shutil.which("node")
        frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
        renderer = frontend_dir / "render-cv-pdf-test.mjs"
        if not node or not (frontend_dir / "node_modules" / "@react-pdf" / "renderer").exists():
            self.skipTest("Node dependencies are not installed")

        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "cv-builder.pdf"
            result = subprocess.run(
                [node, str(renderer), str(output)],
                cwd=frontend_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=60,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue(output.read_bytes().startswith(b"%PDF-"))

            with fitz.open(output) as document:
                self.assertGreaterEqual(document.page_count, 2)
                page_texts = [page.get_text() for page in document]
                images = document[0].get_images(full=True)
                self.assertTrue(images, "PDF phải chứa ảnh chân dung")
                portrait_rects = document[0].get_image_rects(images[0][0])
                self.assertTrue(portrait_rects)
                self.assertAlmostEqual(portrait_rects[0].width, portrait_rects[0].height, delta=1)
                for page in document:
                    self.assertAlmostEqual(page.rect.width, 595.28, delta=1)
                    self.assertAlmostEqual(page.rect.height, 841.89, delta=1)
                    text_blocks = page.get_text("blocks")
                    if text_blocks:
                        self.assertGreaterEqual(min(block[1] for block in text_blocks), 20)

            all_text = "\n".join(page_texts)
            self.assertIn("Nguyễn Văn An", all_text)
            self.assertIn("Đại học Phenikaa", all_text)
            self.assertIn("Chuyên ngành: Công nghệ thông tin", all_text)
            self.assertIn("2021 – 2025", all_text)
            self.assertIn("GPA: 3.4/4.0", all_text)
            self.assertNotIn("Mô tả học vấn cũ không được hiển thị", all_text)
            self.assertNotIn("linkedin.example", all_text)
            self.assertNotIn("portfolio.example", all_text)
            self.assertIn("Xây dựng hệ thống tuyển dụng ổn định", all_text)
            self.assertIn("PostgreSQL", all_text)
            self.assertIn("Nhân viên xuất sắc", all_text)
            for index in range(1, 19):
                number = f"{index:02d}"
                self.assertTrue(
                    any(f"Kinh-nghiệm-{number}" in text and f"Kết-quả-{number}" in text for text in page_texts),
                    f"Kinh nghiệm {number} bị cắt giữa hai trang",
                )

    def test_pdf_without_portrait_remains_text_based(self):
        node = shutil.which("node")
        frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
        renderer = frontend_dir / "render-cv-pdf-test.mjs"
        if not node or not (frontend_dir / "node_modules" / "@react-pdf" / "renderer").exists():
            self.skipTest("Node dependencies are not installed")

        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "cv-without-portrait.pdf"
            result = subprocess.run(
                [node, str(renderer), str(output), "--no-portrait", "--legacy-education"],
                cwd=frontend_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=60,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            with fitz.open(output) as document:
                self.assertFalse(document[0].get_images(full=True))
                self.assertIn("Nguyễn Văn An", "\n".join(page.get_text() for page in document))
                text = "\n".join(page.get_text() for page in document)
                self.assertIn("2018 - 2022", text)
                self.assertNotIn("GPA:", text)
                self.assertNotIn("Mô tả học vấn cũ không được hiển thị", text)
                self.assertNotIn("linkedin.example", text)
                self.assertNotIn("portfolio.example", text)

    def test_long_vietnamese_names_do_not_overlap_desired_position(self):
        node = shutil.which("node")
        frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
        renderer = frontend_dir / "render-cv-pdf-test.mjs"
        if not node or not (frontend_dir / "node_modules" / "@react-pdf" / "renderer").exists():
            self.skipTest("Node dependencies are not installed")

        names = [
            "Nguyễn Văn A",
            "Nguyễn Anh Khiêm",
            "Nguyễn Hoàng Minh Anh",
            "Nguyễn Thị Hoàng Anh Phương Thảo",
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            for index, name in enumerate(names):
                output = Path(temp_dir) / f"identity-{index}.pdf"
                result = subprocess.run(
                    [node, str(renderer), str(output), "--identity-only", f"--name={name}"],
                    cwd=frontend_dir,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=60,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                with fitz.open(output) as document:
                    words = document[0].get_text("words")
                    name_rects = self._find_word_sequence(words, name)
                    position_rects = self._find_word_sequence(words, "Frontend Developer")
                    self.assertTrue(name_rects, f"Không tìm thấy họ tên trong PDF: {name}")
                    self.assertTrue(position_rects, f"Không tìm thấy vị trí trong PDF: {name}")
                    self.assertGreaterEqual(
                        min(rect[1] for rect in position_rects) - max(rect[3] for rect in name_rects),
                        2,
                        f"Họ tên đang chồng lên vị trí ứng tuyển: {name}",
                    )

    @staticmethod
    def _find_word_sequence(words, phrase):
        expected = phrase.split()
        for start in range(len(words) - len(expected) + 1):
            if [word[4] for word in words[start:start + len(expected)]] == expected:
                return words[start:start + len(expected)]
        return []


if __name__ == "__main__":
    unittest.main()
