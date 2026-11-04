import io
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import fitz
from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.models import Application, CVDraft, CVDraftExport, Job, Resume, User
from app.routers import (
    activate_resume,
    apply,
    create_cv_draft,
    delete_cv_draft,
    get_cv_draft,
    get_cv_draft_portrait,
    list_cv_drafts,
    my_resumes,
    save_cv_draft_to_resumes,
    upload_cv_draft_portrait,
    update_cv_draft,
)
from app.schemas import CVDraftIn


def draft_data(name="Nguyễn Văn An"):
    return CVDraftIn.model_validate(
        {
            "title": "CV Backend Developer",
            "template_key": "olive_sidebar",
            "content": {
                "personal": {
                    "full_name": name,
                    "desired_position": "Backend Developer",
                    "email": "candidate@example.com",
                    "phone": "0900000000",
                    "address": "Hà Nội",
                    "birth_date": "1999-01-15",
                    "github": "https://github.com/example",
                    "linkedin": "",
                    "portfolio": "",
                },
                "objective": "Xây dựng hệ thống tuyển dụng ổn định.",
                "summary": "Ba năm kinh nghiệm phát triển API.",
                "education": [
                    {
                        "school": "Đại học Phenikaa",
                        "major": "Công nghệ thông tin",
                        "start_date": "2021",
                        "end_date": "2025",
                        "gpa": "3.4/4.0",
                        "description": "Mô tả cũ được bảo toàn",
                    }
                ],
                "experience": [
                    {"company": "Example Co", "position": "Backend Developer", "period": "2022 - nay", "description": "Phát triển REST API."}
                ],
                "skills": ["Python", "FastAPI", "PostgreSQL"],
                "hobbies": ["Đọc sách", "Chạy bộ"],
                "projects": [
                    {"name": "Smart Recruitment AI", "technologies": "Python, FastAPI", "role": "Backend", "description": "Xây dựng AI matching."}
                ],
                "certificates": [
                    {"name": "Cloud Fundamentals", "issuer": "Example Academy", "period": "2025"}
                ],
                "awards": [
                    {"name": "Nhân viên xuất sắc", "issuer": "Example Co", "period": "2024", "description": "Top performer"}
                ],
            },
        }
    )


def pdf_upload():
    document = fitz.open()
    page = document.new_page(width=595.28, height=841.89)
    page.insert_textbox(
        fitz.Rect(55, 55, 540, 790),
        "Nguyen Van An\nBackend Developer\nPython FastAPI PostgreSQL\n3 years experience\nProject: Smart Recruitment AI",
        fontsize=11,
    )
    contents = document.tobytes()
    document.close()
    return UploadFile(file=io.BytesIO(contents), filename="cv-builder.pdf")


def portrait_upload(width=1200, height=800, color=(84, 104, 76), image_format="PNG"):
    output = io.BytesIO()
    image = Image.new("RGB", (width, height), color)
    image.save(output, format=image_format)
    return UploadFile(file=io.BytesIO(output.getvalue()), filename=f"portrait.{image_format.lower()}")


class CVBuilderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.candidate = User(
            email="candidate@example.com",
            hashed_password="hash",
            role="candidate",
            full_name="Nguyễn Văn An",
        )
        self.other_candidate = User(
            email="other@example.com",
            hashed_password="hash",
            role="candidate",
            full_name="Candidate B",
        )
        self.recruiter = User(
            email="recruiter@example.com",
            hashed_password="hash",
            role="recruiter",
            full_name="Recruiter",
        )
        self.db.add_all([self.candidate, self.other_candidate, self.recruiter])
        self.db.commit()
        for user in (self.candidate, self.other_candidate, self.recruiter):
            self.db.refresh(user)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_reload_update_and_delete_draft(self):
        created = create_cv_draft(draft_data(), self.db, self.candidate)
        self.assertEqual(created["candidate_id"], self.candidate.id)
        self.assertFalse(created["has_portrait"])
        self.assertEqual(created["content"]["education"][0]["school"], "Đại học Phenikaa")
        self.assertEqual(created["content"]["education"][0]["gpa"], "3.4/4.0")
        self.assertEqual(created["content"]["education"][0]["description"], "Mô tả cũ được bảo toàn")
        self.assertEqual([item["id"] for item in list_cv_drafts(self.db, self.candidate)], [created["id"]])

        updated_payload = draft_data().model_dump(mode="json")
        updated_payload["content"]["experience"].append(
            {"company": "Second Co", "position": "Engineer", "period": "2020", "description": "APIs"}
        )
        updated_payload["content"]["projects"] = []
        updated_data = CVDraftIn.model_validate(updated_payload)
        updated = update_cv_draft(created["id"], updated_data, self.db, self.candidate)
        self.assertEqual(len(updated["content"]["experience"]), 2)
        self.assertEqual(updated["content"]["projects"], [])
        self.assertEqual(get_cv_draft(created["id"], self.db, self.candidate)["title"], "CV Backend Developer")

        deleted = delete_cv_draft(created["id"], self.db, self.candidate)
        self.assertEqual(deleted["message"], "CV draft deleted")
        self.assertEqual(self.db.scalar(select(func.count(CVDraft.id))), 0)

    def test_candidate_cannot_read_update_delete_or_export_another_draft(self):
        created = create_cv_draft(draft_data(), self.db, self.candidate)
        calls = (
            lambda: get_cv_draft(created["id"], self.db, self.other_candidate),
            lambda: update_cv_draft(created["id"], draft_data("Candidate B"), self.db, self.other_candidate),
            lambda: delete_cv_draft(created["id"], self.db, self.other_candidate),
            lambda: upload_cv_draft_portrait(created["id"], portrait_upload(), self.db, self.other_candidate),
            lambda: get_cv_draft_portrait(created["id"], self.db, self.other_candidate),
            lambda: save_cv_draft_to_resumes(created["id"], pdf_upload(), self.db, self.other_candidate),
        )
        for call in calls:
            with self.subTest(call=call), self.assertRaises(HTTPException) as raised:
                call()
            self.assertEqual(raised.exception.status_code, 404)

    def test_schema_rejects_html_and_limits_collections(self):
        payload = draft_data().model_dump(mode="json")
        payload["content"]["summary"] = "<script>alert(1)</script>"
        with self.assertRaises(ValidationError):
            CVDraftIn.model_validate(payload)

    def test_portrait_is_private_normalized_persisted_and_removed_with_draft(self):
        old_upload_dir = settings.UPLOAD_DIR
        with tempfile.TemporaryDirectory() as upload_dir:
            settings.UPLOAD_DIR = upload_dir
            try:
                draft = create_cv_draft(draft_data(), self.db, self.candidate)
                saved = upload_cv_draft_portrait(draft["id"], portrait_upload(), self.db, self.candidate)
                self.assertTrue(saved["has_portrait"])
                self.assertTrue(saved["portrait_version"])
                stored = self.db.get(CVDraft, draft["id"])
                portrait_path = get_cv_draft_portrait(draft["id"], self.db, self.candidate).path
                with Image.open(portrait_path) as image:
                    self.assertEqual(image.format, "JPEG")
                    self.assertEqual(image.size, (800, 800))
                    self.assertFalse(image.getexif())
                upload_cv_draft_portrait(
                    draft["id"], portrait_upload(width=700, height=1300, color=(70, 90, 120)), self.db, self.candidate
                )
                replaced_path = get_cv_draft_portrait(draft["id"], self.db, self.candidate).path
                self.assertNotEqual(portrait_path, replaced_path)
                self.assertFalse(Path(portrait_path).exists())
                with Image.open(replaced_path) as image:
                    self.assertEqual(image.size, (800, 800))
                portrait_path = replaced_path
                self.assertEqual(get_cv_draft(draft["id"], self.db, self.candidate)["portrait_version"], stored.portrait_sha256[:12])
                with self.assertRaises(HTTPException) as raised:
                    get_cv_draft_portrait(draft["id"], self.db, self.other_candidate)
                self.assertEqual(raised.exception.status_code, 404)
                delete_cv_draft(draft["id"], self.db, self.candidate)
                self.assertFalse(Path(portrait_path).exists())
            finally:
                settings.UPLOAD_DIR = old_upload_dir

    def test_portrait_rejects_invalid_oversized_and_excessive_dimensions(self):
        draft = create_cv_draft(draft_data(), self.db, self.candidate)
        invalid = UploadFile(file=io.BytesIO(b"not-an-image"), filename="fake.png")
        with self.assertRaises(HTTPException) as raised:
            upload_cv_draft_portrait(draft["id"], invalid, self.db, self.candidate)
        self.assertEqual(raised.exception.status_code, 400)

        oversized = UploadFile(file=io.BytesIO(b"x" * (5 * 1024 * 1024 + 1)), filename="large.jpg")
        with self.assertRaises(HTTPException) as raised:
            upload_cv_draft_portrait(draft["id"], oversized, self.db, self.candidate)
        self.assertEqual(raised.exception.status_code, 413)

        huge = io.BytesIO()
        Image.new("1", (5000, 4000)).save(huge, format="PNG")
        with self.assertRaises(HTTPException) as raised:
            upload_cv_draft_portrait(
                draft["id"],
                UploadFile(file=io.BytesIO(huge.getvalue()), filename="huge.png"),
                self.db,
                self.candidate,
            )
        self.assertEqual(raised.exception.status_code, 400)

        payload = draft_data().model_dump(mode="json")
        payload["content"]["education"] *= 13
        with self.assertRaises(ValidationError):
            CVDraftIn.model_validate(payload)

        legacy = draft_data().model_dump(mode="json")
        legacy["template_key"] = "navy"
        legacy["content"]["personal"].pop("birth_date")
        legacy["content"].pop("hobbies")
        legacy["content"].pop("awards")
        legacy["content"]["education"] = [
            {"school": "Đại học cũ", "major": "CNTT", "period": "2018 - 2022", "description": "Mô tả cũ"}
        ]
        validated_legacy = CVDraftIn.model_validate(legacy)
        self.assertEqual(validated_legacy.content.hobbies, [])
        self.assertEqual(validated_legacy.content.education[0].gpa, "")
        self.assertEqual(validated_legacy.content.education[0].description, "Mô tả cũ")

        invalid_gpa = draft_data().model_dump(mode="json")
        invalid_gpa["content"]["education"][0]["gpa"] = "điểm cao"
        with self.assertRaises(ValidationError):
            CVDraftIn.model_validate(invalid_gpa)

    def test_generated_pdf_is_idempotent_active_ai_readable_and_can_apply(self):
        old_upload_dir = settings.UPLOAD_DIR
        with tempfile.TemporaryDirectory() as upload_dir:
            settings.UPLOAD_DIR = upload_dir
            try:
                draft = create_cv_draft(draft_data(), self.db, self.candidate)
                first = save_cv_draft_to_resumes(draft["id"], pdf_upload(), self.db, self.candidate)
                second = save_cv_draft_to_resumes(draft["id"], pdf_upload(), self.db, self.candidate)
                upload_cv_draft_portrait(draft["id"], portrait_upload(color=(120, 80, 60)), self.db, self.candidate)
                after_portrait_change = save_cv_draft_to_resumes(draft["id"], pdf_upload(), self.db, self.candidate)
            finally:
                settings.UPLOAD_DIR = old_upload_dir

        self.assertEqual(first["id"], second["id"])
        self.assertNotEqual(first["id"], after_portrait_change["id"])
        self.assertEqual(self.db.scalar(select(func.count(Resume.id))), 2)
        self.assertEqual(self.db.scalar(select(func.count(CVDraftExport.id))), 2)
        resume = self.db.get(Resume, after_portrait_change["id"])
        self.assertIn("Python", resume.raw_text)
        self.assertIn("python", resume.skills)
        self.assertTrue(my_resumes(self.db, self.candidate)[0]["is_active"])

        job = Job(
            title="Backend Developer",
            description="Build Python FastAPI services with PostgreSQL",
            skills="python, fastapi, postgresql",
            recruiter_id=self.recruiter.id,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        result = apply(job.id, self.db, self.candidate)
        application = self.db.get(Application, result["application_id"])
        self.assertEqual(application.resume_id, resume.id)
        self.assertGreater(result["match"]["skill_score"], 0)

    def test_new_export_version_does_not_reuse_legacy_pdf(self):
        draft_out = create_cv_draft(draft_data(), self.db, self.candidate)
        draft = self.db.get(CVDraft, draft_out["id"])
        legacy_resume = Resume(candidate_id=self.candidate.id, filename="legacy.pdf", raw_text="Legacy LinkedIn Portfolio")
        self.db.add(legacy_resume)
        self.db.flush()
        legacy_hash = hashlib.sha256(
            json.dumps(
                {
                    "title": draft.title,
                    "template_key": draft.template_key,
                    "content": draft.content,
                    "portrait_sha256": draft.portrait_sha256 or "",
                },
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        self.db.add(CVDraftExport(draft_id=draft.id, resume_id=legacy_resume.id, content_hash=legacy_hash))
        self.db.commit()

        old_upload_dir = settings.UPLOAD_DIR
        with tempfile.TemporaryDirectory() as upload_dir:
            settings.UPLOAD_DIR = upload_dir
            try:
                exported = save_cv_draft_to_resumes(draft.id, pdf_upload(), self.db, self.candidate)
                repeated = save_cv_draft_to_resumes(draft.id, pdf_upload(), self.db, self.candidate)
            finally:
                settings.UPLOAD_DIR = old_upload_dir

        self.assertNotEqual(exported["id"], legacy_resume.id)
        self.assertEqual(repeated["id"], exported["id"])

    def test_activate_resume_enforces_ownership(self):
        own = Resume(candidate_id=self.candidate.id, filename="own.pdf", raw_text="Python")
        other = Resume(candidate_id=self.other_candidate.id, filename="other.pdf", raw_text="Java")
        self.db.add_all([own, other])
        self.db.commit()
        self.db.refresh(own)
        self.db.refresh(other)
        self.assertTrue(activate_resume(own.id, self.db, self.candidate)["is_active"])
        with self.assertRaises(HTTPException) as raised:
            activate_resume(other.id, self.db, self.candidate)
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
