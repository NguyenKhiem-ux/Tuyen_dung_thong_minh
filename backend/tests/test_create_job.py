import os
import unittest

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Company, Job, User
from app.routers import create_job, list_my_jobs
from app.schemas import JobCreate


class CreateJobTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def recruiter(self, email):
        user = User(email=email, hashed_password="hash", role="recruiter", full_name=email)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def company(self, recruiter, name="Company"):
        company = Company(name=name, recruiter_id=recruiter.id)
        self.db.add(company)
        self.db.commit()
        self.db.refresh(company)
        return company

    @staticmethod
    def job_data(**extra):
        return JobCreate(
            title="Backend Developer",
            description="Build APIs",
            skills="Python, FastAPI",
            min_experience=2,
            location="Remote",
            employment_type="Full-time",
            salary_range="20-30 triệu",
            **extra,
        )

    def test_recruiter_with_company_can_create_job(self):
        recruiter = self.recruiter("owner@example.com")
        company = self.company(recruiter)

        result = create_job(self.job_data(), db=self.db, user=recruiter)

        job = self.db.get(Job, result["id"])
        self.assertEqual(job.recruiter_id, recruiter.id)
        self.assertEqual(job.company_id, company.id)
        self.assertEqual(job.status, "open")

    def test_recruiter_without_company_is_blocked(self):
        recruiter = self.recruiter("no-company@example.com")

        with self.assertRaises(HTTPException) as raised:
            create_job(self.job_data(), db=self.db, user=recruiter)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            raised.exception.detail,
            "Vui lòng tạo hồ sơ công ty trước khi đăng tin tuyển dụng.",
        )
        self.assertEqual(self.db.scalar(select(func.count(Job.id))), 0)
        self.assertEqual(self.db.scalar(select(func.count(Company.id))), 0)

    def test_client_company_id_cannot_attach_job_to_another_company(self):
        recruiter = self.recruiter("owner@example.com")
        own_company = self.company(recruiter, "Own Company")
        other_recruiter = self.recruiter("other@example.com")
        other_company = self.company(other_recruiter, "Other Company")
        payload = JobCreate.model_validate(
            {**self.job_data().model_dump(), "company_id": other_company.id}
        )

        result = create_job(payload, db=self.db, user=recruiter)

        job = self.db.get(Job, result["id"])
        self.assertNotIn("company_id", JobCreate.model_fields)
        self.assertEqual(job.company_id, own_company.id)
        self.assertNotEqual(job.company_id, other_company.id)

    def test_get_my_jobs_still_returns_only_current_recruiter_jobs(self):
        recruiter = self.recruiter("owner@example.com")
        own_company = self.company(recruiter, "Own Company")
        own_job = create_job(self.job_data(), db=self.db, user=recruiter)
        other_recruiter = self.recruiter("other@example.com")
        other_company = self.company(other_recruiter, "Other Company")
        self.db.add(
            Job(
                title="Other Job",
                description="Other",
                recruiter_id=other_recruiter.id,
                company_id=other_company.id,
            )
        )
        self.db.commit()

        jobs = list_my_jobs(db=self.db, user=recruiter)

        self.assertEqual([job["id"] for job in jobs], [own_job["id"]])
        self.assertEqual(jobs[0]["company_id"], own_company.id)


if __name__ == "__main__":
    unittest.main()
