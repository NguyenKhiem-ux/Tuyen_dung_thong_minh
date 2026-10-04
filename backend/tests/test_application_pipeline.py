import os
import unittest

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.deps import require_role
from app.models import Application, ApplicationStatusHistory, Job, Resume, User
from app.routers import application_status_history, update_application_status
from app.schemas import ApplicationStatusUpdateIn


class ApplicationPipelineTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.recruiter_a = self.user("owner@example.com", "recruiter", "Recruiter A")
        self.recruiter_b = self.user("other@example.com", "recruiter", "Recruiter B")
        self.candidate = self.user("candidate@example.com", "candidate", "Candidate")
        self.admin = self.user("admin@example.com", "admin", "Admin")
        self.job_a = self.job(self.recruiter_a, "Job A")
        self.job_b = self.job(self.recruiter_b, "Job B")
        self.resume = Resume(candidate_id=self.candidate.id, filename="cv.pdf", raw_text="Python FastAPI")
        self.db.add(self.resume)
        self.db.commit()
        self.db.refresh(self.resume)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def user(self, email, role, full_name):
        user = User(email=email, hashed_password="hash", role=role, full_name=full_name)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def job(self, recruiter, title):
        job = Job(title=title, description="Description", recruiter_id=recruiter.id)
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def application(self, job=None, status="applied"):
        application = Application(
            candidate_id=self.candidate.id,
            job_id=(job or self.job_a).id,
            resume_id=self.resume.id,
            status=status,
        )
        self.db.add(application)
        self.db.commit()
        self.db.refresh(application)
        return application

    def update(self, application, status, user=None, reason=None):
        return update_application_status(
            application.id,
            ApplicationStatusUpdateIn(status=status, reason=reason),
            db=self.db,
            user=user or self.recruiter_a,
        )

    def test_valid_pipeline_creates_one_history_per_update(self):
        application = self.application()
        for status in ("screening", "interview", "offer", "hired"):
            self.assertEqual(self.update(application, status)["status"], status)

        rows = list(self.db.scalars(
            select(ApplicationStatusHistory)
            .where(ApplicationStatusHistory.application_id == application.id)
            .order_by(ApplicationStatusHistory.id)
        ))
        self.assertEqual(
            [(row.old_status, row.new_status) for row in rows],
            [("applied", "screening"), ("screening", "interview"), ("interview", "offer"), ("offer", "hired")],
        )
        self.assertTrue(all(row.changed_by == self.recruiter_a.id for row in rows))

    def test_screening_can_be_rejected_with_reason(self):
        application = self.application(status="screening")
        self.update(application, "rejected", reason="Không đáp ứng yêu cầu kỹ thuật")

        history = self.db.scalar(select(ApplicationStatusHistory).where(
            ApplicationStatusHistory.application_id == application.id
        ))
        self.assertEqual((history.old_status, history.new_status), ("screening", "rejected"))
        self.assertEqual(history.reason, "Không đáp ứng yêu cầu kỹ thuật")

    def test_invalid_transitions_are_rejected_without_history(self):
        for old_status, new_status in (("applied", "hired"), ("rejected", "interview")):
            with self.subTest(old_status=old_status, new_status=new_status):
                application = self.application(status=old_status)
                with self.assertRaises(HTTPException) as raised:
                    self.update(application, new_status)
                self.assertEqual(raised.exception.status_code, 409)
                self.assertEqual(application.status, old_status)
                self.assertEqual(len(application.status_history), 0)

    def test_other_recruiter_cannot_update_or_read_history(self):
        application = self.application(job=self.job_b)
        with self.assertRaises(HTTPException) as update_error:
            self.update(application, "screening")
        with self.assertRaises(HTTPException) as history_error:
            application_status_history(application.id, db=self.db, user=self.recruiter_a)
        self.assertEqual(update_error.exception.status_code, 404)
        self.assertEqual(history_error.exception.status_code, 404)

    def test_candidate_and_admin_fail_recruiter_role_guard(self):
        guard = require_role("recruiter")
        for user in (self.candidate, self.admin):
            with self.subTest(role=user.role), self.assertRaises(HTTPException) as raised:
                guard(user)
            self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
