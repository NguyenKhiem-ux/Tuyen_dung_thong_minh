import io
import os
import tempfile
import unittest
from unittest.mock import patch

from docx import Document
from fastapi import HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.deps import current_user, require_role
from app.models import AIFeedback, Application, Job, Resume, User
from app.routers import (
    ai_feedback_summary, get_ai_feedback, recommend_jobs, recommendation_jobs, recommendation_positions,
    resume_insights, save_ai_feedback, upload_resume,
)
from app.schemas import AIFeedbackIn, RecommendationRequest
from app.security import create_access_token

CV = (
    "Le Van An\nGender: Female\nAddress: Ha Noi\n"
    "EXPERIENCE\nBackend Engineer, ACME  Jan 2021 - present\n"
    "Built REST APIs with Python, FastAPI, PostgreSQL and Docker; cut latency by 35%.\n"
    "PROJECTS\n- Job matcher on github.com/an/matcher using FastAPI\n"
    "EDUCATION\nBachelor of Computer Science, HUST\n"
)


class AIApiTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.candidate = User(email="c@x.ai", hashed_password="t", role="candidate", full_name="Le Van An")
        self.recruiter = User(email="r@x.ai", hashed_password="t", role="recruiter", full_name="Recruiter")
        self.other_recruiter = User(email="r2@x.ai", hashed_password="t", role="recruiter", full_name="Other")
        self.admin = User(email="a@x.ai", hashed_password="t", role="admin", full_name="Admin")
        self.db.add_all([self.candidate, self.recruiter, self.other_recruiter, self.admin])
        self.db.flush()
        self.job = Job(title="Backend Developer", description="Python APIs với FastAPI, PostgreSQL, Docker",
                       skills="python, fastapi, postgresql, ~kubernetes", min_experience=1, status="open",
                       recruiter_id=self.recruiter.id)
        self.job2 = Job(title="Frontend Developer", description="React, TypeScript, CSS", skills="react, typescript, css",
                        min_experience=1, status="open", recruiter_id=self.recruiter.id)
        self.job3 = Job(title="Frontend Developer", description="React, accessibility, testing", skills="react, css",
                        min_experience=2, status="open", recruiter_id=self.recruiter.id)
        self.backend_job = Job(title="Backend Engineer", description="Python services", skills="python",
                               min_experience=1, status="open", recruiter_id=self.recruiter.id)
        self.closed_job = Job(title="Frontend Developer", description="Closed React role", skills="react",
                              min_experience=1, status="closed", recruiter_id=self.recruiter.id)
        self.db.add_all([self.job, self.job2, self.job3, self.backend_job, self.closed_job])
        self.db.flush()
        self.resume = Resume(candidate_id=self.candidate.id, filename="cv.docx", raw_text=CV,
                             skills="python, fastapi", experience_years=3)
        self.db.add(self.resume)
        self.db.flush()
        self.application = Application(candidate_id=self.candidate.id, job_id=self.job.id, resume_id=self.resume.id,
                                       final_score=82.5)
        self.db.add(self.application)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    # ----- insights -----
    def test_resume_insights_returns_quality_and_tips(self):
        result = resume_insights(self.db, self.candidate)
        self.assertIn("quality_score", result)
        self.assertIsInstance(result["tips"], list)
        self.assertIn("python", result["skills"])

    def test_resume_insights_requires_a_resume(self):
        with self.assertRaises(HTTPException) as ctx:
            resume_insights(self.db, User(id=999, email="n@x.ai", hashed_password="t", role="candidate", full_name="N"))
        self.assertEqual(ctx.exception.status_code, 404)

    # ----- recommendations -----
    def test_recommendations_expose_matched_partial_preferred_and_evidence(self):
        result = recommend_jobs(
            RecommendationRequest(resume_id=self.resume.id, position="Frontend Developer", mode="position", limit=5),
            self.db,
            self.candidate,
        )
        item = result["items"]
        self.assertEqual({i["job"]["id"] for i in item}, {self.job2.id, self.job3.id})
        self.assertEqual(result["analyzed_count"], 2)
        for key in (
            "skill_score", "experience_score", "semantic_score", "project_score",
            "matched_skills", "partial_skills", "preferred_skills", "evidence", "missing_skills", "engine_version",
        ):
            self.assertIn(key, item[0])

    def test_candidate_name_is_passed_for_redaction(self):
        with patch("app.routers.recommend_jobs_for_resume", return_value=[]) as mocked:
            recommend_jobs(
                RecommendationRequest(resume_id=self.resume.id, position="Frontend Developer", mode="position"),
                self.db,
                self.candidate,
            )
        self.assertEqual(mocked.call_args.kwargs["redact_terms"], ["Le Van An"])

    def test_positions_and_jobs_are_filtered_before_ai_scoring(self):
        self.assertEqual(
            recommendation_positions(self.db, self.candidate)["positions"],
            ["Backend Engineer", "Frontend Developer"],
        )
        self.assertEqual(
            {job["id"] for job in recommendation_jobs("Frontend Developer", self.db, self.candidate)},
            {self.job2.id, self.job3.id},
        )
        with patch("app.routers.recommend_jobs_for_resume", return_value=[]) as mocked:
            recommend_jobs(
                RecommendationRequest(resume_id=self.resume.id, position="Frontend Developer", mode="position"),
                self.db,
                self.candidate,
            )
        scored_jobs = mocked.call_args.args[3]
        self.assertEqual({job.id for job in scored_jobs}, {self.job2.id, self.job3.id})
        self.assertNotIn(self.backend_job.id, {job.id for job in scored_jobs})

    def test_single_mode_scores_exactly_one_job(self):
        application_count = self.db.query(Application).count()
        with patch("app.routers.recommend_jobs_for_resume", return_value=[]) as mocked:
            result = recommend_jobs(
                RecommendationRequest(
                    resume_id=self.resume.id,
                    position="Frontend Developer",
                    mode="single",
                    job_id=self.job2.id,
                ),
                self.db,
                self.candidate,
            )
        self.assertEqual(result["analyzed_count"], 1)
        self.assertEqual([job.id for job in mocked.call_args.args[3]], [self.job2.id])
        self.assertEqual(self.db.query(Application).count(), application_count)

    def test_position_mode_honors_backend_candidate_limit(self):
        with patch("app.routers.settings.AI_RECOMMENDATION_CANDIDATE_LIMIT", 1), \
                patch("app.routers.recommend_jobs_for_resume", return_value=[]) as mocked:
            result = recommend_jobs(
                RecommendationRequest(resume_id=self.resume.id, position="Frontend Developer", mode="position"),
                self.db,
                self.candidate,
            )
        self.assertEqual(result["analyzed_count"], 1)
        self.assertEqual(len(mocked.call_args.args[3]), 1)

    def test_recommendations_reject_foreign_resume_and_closed_or_mismatched_job(self):
        foreign_resume = Resume(candidate_id=self.recruiter.id, filename="foreign.pdf", raw_text=CV,
                                skills="python", experience_years=3)
        self.db.add(foreign_resume)
        self.db.commit()
        with self.assertRaises(HTTPException) as foreign:
            recommend_jobs(
                RecommendationRequest(resume_id=foreign_resume.id, position="Frontend Developer", mode="position"),
                self.db,
                self.candidate,
            )
        self.assertEqual(foreign.exception.status_code, 404)
        for job, position in ((self.closed_job, "Frontend Developer"), (self.job2, "Backend Engineer")):
            with self.assertRaises(HTTPException) as missing:
                recommend_jobs(
                    RecommendationRequest(
                        resume_id=self.resume.id, position=position, mode="single", job_id=job.id,
                    ),
                    self.db,
                    self.candidate,
                )
            self.assertEqual(missing.exception.status_code, 404)
        with self.assertRaises(HTTPException) as missing:
            recommend_jobs(
                RecommendationRequest(
                    resume_id=self.resume.id, position="Frontend Developer", mode="single", job_id=999_999,
                ),
                self.db,
                self.candidate,
            )
        self.assertEqual(missing.exception.status_code, 404)

    def test_recommendations_require_a_candidate_jwt_role(self):
        token = create_access_token({"sub": str(self.candidate.id)})
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        authenticated = current_user(credentials, self.db)
        self.assertEqual(authenticated.id, self.candidate.id)
        self.assertEqual(require_role("candidate")(authenticated).id, self.candidate.id)
        with self.assertRaises(HTTPException) as forbidden:
            require_role("candidate")(self.recruiter)
        self.assertEqual(forbidden.exception.status_code, 403)

    def test_recommendations_use_current_cv_and_job_content_without_stale_cache(self):
        data = RecommendationRequest(
            resume_id=self.resume.id, position="Frontend Developer", mode="single", job_id=self.job2.id,
        )
        with patch("app.routers.recommend_jobs_for_resume", return_value=[]) as mocked:
            recommend_jobs(data, self.db, self.candidate)
            self.resume.raw_text = "Updated CV with React"
            self.job2.description = "Updated React job description"
            self.db.commit()
            recommend_jobs(data, self.db, self.candidate)
        self.assertEqual(mocked.call_count, 2)
        self.assertEqual(mocked.call_args.args[0], "Updated CV with React")
        self.assertEqual(mocked.call_args.args[3][0].description, "Updated React job description")

    # ----- upload -----
    def _upload(self, paragraphs):
        document = Document()
        for line in paragraphs:
            document.add_paragraph(line)
        buffer = io.BytesIO()
        document.save(buffer)
        buffer.seek(0)
        return UploadFile(file=buffer, filename="cv.docx")

    def test_empty_resume_is_rejected_and_file_removed(self):
        with tempfile.TemporaryDirectory() as tmp, patch("app.routers.settings") as settings:
            settings.UPLOAD_DIR, settings.MAX_UPLOAD_MB = tmp, 8
            with self.assertRaises(HTTPException) as ctx:
                upload_resume(self._upload(["Hi"]), self.db, self.candidate)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Không đọc được văn bản", ctx.exception.detail)
            self.assertEqual(os.listdir(tmp), [])

    def test_valid_resume_is_accepted(self):
        with tempfile.TemporaryDirectory() as tmp, patch("app.routers.settings") as settings:
            settings.UPLOAD_DIR, settings.MAX_UPLOAD_MB = tmp, 8
            out = upload_resume(self._upload(CV.splitlines()), self.db, self.candidate)
        self.assertIn("python", out["skills"])

    # ----- feedback -----
    def test_feedback_is_saved_and_updated_once_per_recruiter(self):
        saved = save_ai_feedback(self.application.id, AIFeedbackIn(label="too_high", note="  thiếu k8s "),
                                 self.db, self.recruiter)
        self.assertEqual((saved["label"], saved["note"], saved["score_snapshot"]), ("too_high", "thiếu k8s", 82.5))
        save_ai_feedback(self.application.id, AIFeedbackIn(label="agree"), self.db, self.recruiter)
        self.assertEqual(self.db.query(AIFeedback).count(), 1)
        self.assertEqual(get_ai_feedback(self.application.id, self.db, self.recruiter)["label"], "agree")

    def test_feedback_validation_and_ownership(self):
        with self.assertRaises(HTTPException) as bad:
            save_ai_feedback(self.application.id, AIFeedbackIn(label="great"), self.db, self.recruiter)
        self.assertEqual(bad.exception.status_code, 400)
        with self.assertRaises(HTTPException) as foreign:
            save_ai_feedback(self.application.id, AIFeedbackIn(label="agree"), self.db, self.other_recruiter)
        self.assertEqual(foreign.exception.status_code, 404)
        with self.assertRaises(HTTPException):
            get_ai_feedback(self.application.id, self.db, self.other_recruiter)

    def test_get_feedback_is_none_before_any_is_saved(self):
        self.assertIsNone(get_ai_feedback(self.application.id, self.db, self.recruiter))

    def test_admin_summary(self):
        empty = ai_feedback_summary(self.db, self.admin)
        self.assertEqual((empty["total"], empty["agreement_rate"], empty["enough_data_to_tune"]), (0, None, False))
        save_ai_feedback(self.application.id, AIFeedbackIn(label="too_low"), self.db, self.recruiter)
        summary = ai_feedback_summary(self.db, self.admin)
        self.assertEqual(summary["counts"], {"agree": 0, "too_high": 0, "too_low": 1})
        self.assertEqual(summary["agreement_rate"], 0.0)
        self.assertEqual(summary["average_score_by_label"]["too_low"], 82.5)
        self.assertFalse(summary["enough_data_to_tune"])


if __name__ == "__main__":
    unittest.main()
