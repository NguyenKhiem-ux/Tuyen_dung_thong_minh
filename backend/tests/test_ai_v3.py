import os
import tempfile
import unittest
from datetime import date
from unittest import mock
from types import SimpleNamespace

from app import ai_service
from app.ai_service import (
    ScoringContext, extract_text_from_file, match_candidate, parse_weights, recommend_jobs_for_resume,
    redact_pii, resume_tips,
)

NOW = date(2026, 10, 20)
CV = (
    "Le Van An - Backend Developer\n"
    "EXPERIENCE\nBackend Engineer, ACME  Jan 2021 - present\n"
    "Built REST APIs with Python, FastAPI, PostgreSQL and Docker; cut latency by 35% for 20k users.\n"
    "PROJECTS\n- Job matcher on github.com/an/matcher using FastAPI\n"
    "EDUCATION\nBachelor of Computer Science, HUST\n"
)
SENSITIVE = (
    "Gender: Female\nDate of birth: 12/03/1995\nMarital status: Married\nNationality: Vietnamese\n"
    "Address: 12 Nguyen Trai, Thanh Xuan, Ha Noi\nPhone: +84 912 345 678\nEmail: an.le@example.com\n"
    "Giới tính: Nữ\nNgày sinh: 12/03/1995\nĐịa chỉ: 12 Nguyễn Trái, Hà Nội\n"
)
JOB = dict(job_description="Backend Developer với Python, FastAPI, PostgreSQL, Docker và REST API.",
           job_skills="python, fastapi, postgresql, docker, rest api", min_exp=1, job_title="Backend Developer")
JOBS = [
    SimpleNamespace(id=1, title="Backend Developer", skills="python, fastapi, postgresql, docker",
                    min_experience=1, description="Backend Developer với Python, FastAPI, PostgreSQL, Docker. Làm việc tại Hà Nội."),
    SimpleNamespace(id=2, title="Frontend Developer", skills="react, typescript, css",
                    min_experience=1, description="Frontend Developer thành thạo React, TypeScript, CSS."),
]


def score(cv, **kw):
    ctx = ScoringContext.from_jobs(JOBS)
    return match_candidate(**JOB, resume_text=cv, resume_skills=[], resume_exp=0, context=ctx, now=NOW, **kw)


class PreferredSkillTests(unittest.TestCase):
    PAD = " Worked on web services every day." * 8

    def _m(self, cv, skills):
        return match_candidate("d", skills, 0, cv + self.PAD, [], 0, now=NOW)

    def test_markers_are_parsed(self):
        m = self._m("Python only.", "python, ~docker, kubernetes (ưu tiên), terraform (nice to have), sql")
        self.assertEqual(m["preferred_skills"], ["docker", "kubernetes", "terraform"])
        self.assertEqual(m["job_skills"], ["python", "docker", "kubernetes", "terraform", "sql"])

    def test_missing_preferred_costs_half_as_much(self):
        required = self._m("Python.", "python, docker")["skill_score"]            # thiếu 1/2 bắt buộc
        preferred = self._m("Python.", "python, ~docker")["skill_score"]          # thiếu 1 ưu tiên (0.5/1.5)
        self.assertEqual(required, 50.0)
        self.assertEqual(preferred, 66.67)

    def test_explanation_separates_required_and_preferred(self):
        m = self._m("Python.", "python, sql, ~docker")
        self.assertIn("Kỹ năng còn thiếu: sql", m["explanation"])
        self.assertIn("Kỹ năng ưu tiên chưa có (ảnh hưởng nhẹ): docker", m["explanation"])


class FairnessTests(unittest.TestCase):
    def test_redact_removes_labeled_sensitive_fields_and_contacts(self):
        clean = redact_pii(SENSITIVE + "Skills: Python", ["Le Van An"])
        for leaked in ("Female", "1995", "Married", "Nguyen Trai", "912", "example.com", "Nữ", "Hà Nội", "Vietnamese"):
            self.assertNotIn(leaked, clean)
        self.assertIn("Python", clean)

    def test_year_ranges_are_not_mistaken_for_phone_numbers(self):
        self.assertIn("2019 - 2022", redact_pii("Developer 2019 - 2022"))

    SCORE_KEYS = ("skill_score", "experience_score", "semantic_score", "project_score", "final_score")

    def _scores(self, cv, **kw):
        return {k: score(cv, **kw)[k] for k in self.SCORE_KEYS}

    def test_address_matching_the_job_location_gives_no_advantage(self):
        # Kịch bản thật: tin ghi "Hà Nội", CV có dòng "Địa chỉ: Hà Nội" -> từ trùng sẽ làm tăng điểm ngữ nghĩa.
        in_city = self._scores("Địa chỉ: Hà Nội\n" + CV)
        elsewhere = self._scores("Địa chỉ: Đà Nẵng\n" + CV)
        self.assertEqual(in_city, elsewhere)

    def test_guard_is_not_vacuous(self):
        # Nếu tắt việc che thông tin thì hai điểm phải khác nhau, chứng tỏ test ở trên thật sự bắt lỗi.
        with mock.patch.object(ai_service, "redact_pii", lambda text, extra_terms=(): text):
            in_city = self._scores("Địa chỉ: Hà Nội\n" + CV)
            elsewhere = self._scores("Địa chỉ: Đà Nẵng\n" + CV)
        self.assertNotEqual(in_city["semantic_score"], elsewhere["semantic_score"])

    def test_other_sensitive_fields_do_not_change_scores(self):
        base = self._scores(CV)
        for extra in (SENSITIVE, "Gender: Male\nAge: 41\nMarital status: Single\nReligion: none\n"):
            self.assertEqual(self._scores(extra + CV), base)

    def test_pair_scoring_without_context_is_also_invariant(self):
        def pair(cv):
            return match_candidate(**JOB, resume_text=cv, resume_skills=[], resume_exp=0, now=NOW)["final_score"]
        self.assertEqual(pair(SENSITIVE + CV), pair(CV))

    def test_scores_identical_for_different_names_when_name_is_redacted(self):
        a = score("Le Van An\n" + CV, redact_terms=["Le Van An"])
        b = score("Nguyen Thi Hoa\n" + CV, redact_terms=["Nguyen Thi Hoa"])
        self.assertEqual(a["final_score"], b["final_score"])

    def test_experience_still_uses_original_dates(self):
        # cố ý không che mốc thời gian làm việc: đó là dữ liệu nghề nghiệp, không phải thuộc tính nhạy cảm
        self.assertGreater(score(CV)["experience_score"], 0)


class EvidenceTests(unittest.TestCase):
    def test_evidence_snippets_come_from_the_resume(self):
        m = score(CV)
        self.assertIn("python", m["evidence"])
        self.assertIn("Python", m["evidence"]["python"])
        self.assertIn("FastAPI", m["evidence"]["fastapi"])

    def test_recommend_attaches_evidence_to_top_results_only(self):
        ranked = recommend_jobs_for_resume(CV, [], 0, JOBS, now=NOW, evidence_top=1)
        self.assertIn("evidence", ranked[0]["match"])
        self.assertNotIn("evidence", ranked[1]["match"])


class ResumeTipsTests(unittest.TestCase):
    def codes(self, text):
        return {t["code"] for t in resume_tips(text, NOW)["tips"]}

    def test_good_resume_has_few_tips(self):
        cv = CV + "Skills: Python, FastAPI, PostgreSQL, Docker, Git, Linux, Redis.\n" * 6
        result = resume_tips(cv, NOW)
        self.assertGreaterEqual(result["quality_score"], 85)
        self.assertNotIn("no_metrics", {t["code"] for t in result["tips"]})

    def test_thin_resume_is_flagged(self):
        result = resume_tips("Python dev", NOW)
        self.assertIn("scan_suspect", {t["code"] for t in result["tips"]})
        self.assertLessEqual(result["quality_score"], 75)

    def test_specific_gaps(self):
        text = "I am a hard worker and love my job. " * 20
        codes = self.codes(text)
        self.assertTrue({"no_skills", "no_experience", "no_metrics", "no_projects", "no_links"} <= codes)

    def test_tips_have_vietnamese_message_and_severity(self):
        for tip in resume_tips("hello " * 100, NOW)["tips"]:
            self.assertIn(tip["severity"], {"high", "medium", "low"})
            self.assertTrue(tip["message"])


class WeightsTests(unittest.TestCase):
    def test_valid_weights_are_used(self):
        self.assertEqual(parse_weights("0.5,0.2,0.2,0.1"), {"skill": 0.5, "experience": 0.2, "semantic": 0.2, "project": 0.1})

    def test_invalid_weights_fall_back_to_default(self):
        for bad in ("", "1,2", "0.5,0.5,0.5,0.5", "a,b,c,d", "-0.1,0.5,0.3,0.3"):
            self.assertEqual(parse_weights(bad), ai_service.DEFAULT_WEIGHTS)


@unittest.skipUnless(ai_service.ocr_available(), "Tesseract chưa được cài trên máy này")
class OcrTests(unittest.TestCase):
    def test_scanned_pdf_is_read_by_ocr(self):
        import fitz
        from PIL import Image, ImageDraw, ImageFont
        font = None
        for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"):
            if os.path.exists(path):
                font = ImageFont.truetype(path, 38)
        image = Image.new("RGB", (1240, 700), "white")
        draw = ImageDraw.Draw(image)
        for i, line in enumerate(["Backend Developer", "Skills: Python, FastAPI, Docker", "3 years of experience"]):
            draw.text((60, 60 + i * 80), line, fill="black", font=font)
        with tempfile.TemporaryDirectory() as tmp:
            png = os.path.join(tmp, "scan.png")
            image.save(png)
            doc = fitz.open()
            page = doc.new_page(width=595, height=842)
            page.insert_image(page.rect, filename=png)
            pdf = os.path.join(tmp, "scan.pdf")
            doc.save(pdf)
            doc.close()
            text = extract_text_from_file(pdf, "scan.pdf")
        self.assertIn("python", text.lower())
        self.assertIn("fastapi", text.lower())


if __name__ == "__main__":
    unittest.main()
