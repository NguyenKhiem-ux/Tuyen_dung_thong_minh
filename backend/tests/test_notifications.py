import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Application, Interview, Job, Notification, Resume, User
from app.routers import (
    apply,
    list_notifications,
    notification_unread_count,
    read_all_notifications,
    read_notification,
    schedule_interview,
    update_application_status,
    update_interview_status,
)
from app.schemas import ApplicationStatusUpdateIn, InterviewCreate, InterviewStatusUpdateIn


class NotificationFlowTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.candidate = User(
            email="candidate@example.com",
            hashed_password="test",
            role="candidate",
            full_name="Candidate One",
        )
        self.other_candidate = User(
            email="other@example.com",
            hashed_password="test",
            role="candidate",
            full_name="Candidate Two",
        )
        self.recruiter = User(
            email="recruiter@example.com",
            hashed_password="test",
            role="recruiter",
            full_name="Recruiter One",
        )
        self.db.add_all([self.candidate, self.other_candidate, self.recruiter])
        self.db.flush()
        self.job = Job(
            title="Backend Engineer",
            description="Python APIs",
            recruiter_id=self.recruiter.id,
        )
        self.resume = Resume(
            candidate_id=self.candidate.id,
            filename="cv.pdf",
            raw_text="Python",
            skills="Python",
        )
        self.db.add_all([self.job, self.resume])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def create_application(self, status="applied"):
        application = Application(
            candidate_id=self.candidate.id,
            job_id=self.job.id,
            resume_id=self.resume.id,
            status=status,
        )
        self.db.add(application)
        self.db.commit()
        self.db.refresh(application)
        return application

    def candidate_notifications(self):
        return list(self.db.scalars(
            select(Notification)
            .where(Notification.user_id == self.candidate.id)
            .order_by(Notification.id)
        ))

    @patch("app.routers.match_candidate")
    def test_apply_notifies_candidate_and_recruiter_without_duplicates(self, match_candidate):
        match_candidate.return_value = {
            "skill_score": 90,
            "experience_score": 80,
            "semantic_score": 70,
            "project_score": 60,
            "final_score": 75,
            "missing_skills": [],
            "explanation": "Good match",
        }
        apply(self.job.id, self.db, self.candidate)

        candidate_types = [item.type for item in self.candidate_notifications()]
        recruiter_types = list(self.db.scalars(
            select(Notification.type).where(Notification.user_id == self.recruiter.id)
        ))
        self.assertEqual(candidate_types, ["application_submitted"])
        self.assertEqual(recruiter_types, ["application_received"])

        with self.assertRaises(HTTPException) as error:
            apply(self.job.id, self.db, self.candidate)
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(len(self.candidate_notifications()), 1)

    def test_application_status_changes_notify_candidate(self):
        application = self.create_application()
        update_application_status(
            application.id,
            ApplicationStatusUpdateIn(status="screening"),
            self.db,
            self.recruiter,
        )
        update_application_status(
            application.id,
            ApplicationStatusUpdateIn(status="interview"),
            self.db,
            self.recruiter,
        )

        notifications = self.candidate_notifications()
        self.assertEqual([item.type for item in notifications], [
            "application_status_changed",
            "application_status_changed",
        ])
        self.assertIn("sàng lọc", notifications[0].title)
        self.assertIn("phỏng vấn", notifications[1].title)

    def test_interview_schedule_and_cancel_notify_once(self):
        application = self.create_application(status="interview")
        scheduled_at = datetime.utcnow() + timedelta(days=2)
        result = schedule_interview(
            InterviewCreate(application_id=application.id, scheduled_at=scheduled_at, mode="online"),
            self.db,
            self.recruiter,
        )
        interview = self.db.get(Interview, result["id"])
        update_interview_status(
            interview.id,
            InterviewStatusUpdateIn(status="cancelled"),
            self.db,
            self.recruiter,
        )
        update_interview_status(
            interview.id,
            InterviewStatusUpdateIn(status="cancelled"),
            self.db,
            self.recruiter,
        )

        notifications = self.candidate_notifications()
        self.assertEqual([item.type for item in notifications], ["interview_scheduled", "interview_updated"])
        self.assertIn("Backend Engineer", notifications[0].message)
        self.assertIn(scheduled_at.strftime("%d/%m/%Y %H:%M"), notifications[0].message)
        self.assertIn("hủy", notifications[1].title)

    def test_list_ownership_mark_read_and_read_all_persist(self):
        own = Notification(
            user_id=self.candidate.id,
            type="application_submitted",
            title="Own",
            message="Own notification",
        )
        other = Notification(
            user_id=self.other_candidate.id,
            type="application_submitted",
            title="Other",
            message="Other notification",
        )
        self.db.add_all([own, other])
        self.db.commit()

        self.assertEqual([item.id for item in list_notifications(self.db, self.candidate)], [own.id])
        self.assertEqual([item.id for item in list_notifications(self.db, self.candidate)], [own.id])
        with self.assertRaises(HTTPException) as error:
            read_notification(other.id, self.db, self.candidate)
        self.assertEqual(error.exception.status_code, 404)

        read_notification(own.id, self.db, self.candidate)
        self.db.expire_all()
        self.assertTrue(self.db.get(Notification, own.id).is_read)

        second = Notification(
            user_id=self.candidate.id,
            type="interview_scheduled",
            title="Second",
            message="Second notification",
        )
        self.db.add(second)
        self.db.commit()
        read_all_notifications(self.db, self.candidate)
        self.assertEqual(notification_unread_count(self.db, self.candidate)["count"], 0)


if __name__ == "__main__":
    unittest.main()
