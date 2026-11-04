import unittest
from datetime import datetime, timedelta

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.deps import require_role
from app.models import (
    Application,
    ApplicationStatusHistory,
    Interview,
    InterviewProposal,
    Job,
    Notification,
    Resume,
    User,
)
from app.routers import (
    confirm_interview_proposal,
    create_interview_proposal,
    interview_proposal,
    my_interview_proposals,
    my_interviews,
    recruiter_interview_proposals,
)
from app.schemas import InterviewProposalConfirmIn, InterviewProposalCreate


class InterviewProposalTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.recruiter = self.user("owner@example.com", "recruiter", "Recruiter Owner")
        self.other_recruiter = self.user("other-recruiter@example.com", "recruiter", "Other Recruiter")
        self.candidate = self.user("candidate@example.com", "candidate", "Candidate Owner")
        self.other_candidate = self.user("other-candidate@example.com", "candidate", "Other Candidate")
        self.job = self.create_job(self.recruiter, "Backend Engineer")
        self.other_job = self.create_job(self.other_recruiter, "Other Job")

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def user(self, email, role, full_name):
        user = User(email=email, hashed_password="test", role=role, full_name=full_name)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_job(self, recruiter, title):
        job = Job(title=title, description="Description", recruiter_id=recruiter.id)
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def create_application(self, candidate=None, job=None, status="screening"):
        candidate = candidate or self.candidate
        resume = Resume(candidate_id=candidate.id, filename="cv.pdf", raw_text="Python")
        self.db.add(resume)
        self.db.flush()
        application = Application(
            candidate_id=candidate.id,
            job_id=(job or self.job).id,
            resume_id=resume.id,
            status=status,
        )
        self.db.add(application)
        self.db.commit()
        self.db.refresh(application)
        return application

    def proposal_data(self, application, times=None):
        return InterviewProposalCreate(
            application_id=application.id,
            proposed_times=times or [datetime.utcnow() + timedelta(days=day) for day in (1, 2, 3)],
            duration_minutes=60,
            mode="online",
            location="https://meet.example/interview",
            notes="Technical interview",
            candidate_message="Vui lòng chọn một thời gian phù hợp.",
        )

    def test_owner_flow_creates_history_notifications_and_shared_interview(self):
        application = self.create_application()
        result = create_interview_proposal(self.proposal_data(application), self.db, self.recruiter)

        self.assertEqual(result["status"], "pending")
        self.assertEqual(len(result["options"]), 3)
        self.assertEqual(len({item["scheduled_at"] for item in result["options"]}), 3)
        self.assertTrue(all(item["scheduled_at"] > datetime.utcnow() for item in result["options"]))
        self.assertEqual(self.db.get(Application, application.id).status, "interview")
        history = list(self.db.scalars(select(ApplicationStatusHistory).where(
            ApplicationStatusHistory.application_id == application.id
        )))
        self.assertEqual([(item.old_status, item.new_status) for item in history], [("screening", "interview")])
        self.assertEqual(history[0].candidate_message, "Vui lòng chọn một thời gian phù hợp.")
        self.assertEqual(
            list(self.db.scalars(select(Notification.type).where(Notification.user_id == self.candidate.id))),
            ["application_status_changed", "interview_time_selection_requested"],
        )
        self.assertEqual([item["id"] for item in my_interview_proposals(self.db, self.candidate)], [result["id"]])

        selected = result["options"][1]
        confirmed = confirm_interview_proposal(
            result["id"],
            InterviewProposalConfirmIn(option_id=selected["id"]),
            self.db,
            self.candidate,
        )
        self.assertEqual(confirmed["scheduled_at"], selected["scheduled_at"])
        self.assertEqual(confirmed["status"], "scheduled")
        self.assertEqual(self.db.get(Application, application.id).status, "interview")
        self.assertEqual(my_interview_proposals(self.db, self.candidate), [])
        candidate_interviews = my_interviews(self.db, self.candidate)
        recruiter_interviews = my_interviews(self.db, self.recruiter)
        self.assertEqual(candidate_interviews[0]["scheduled_at"], selected["scheduled_at"])
        self.assertEqual(recruiter_interviews[0]["scheduled_at"], selected["scheduled_at"])
        recruiter_notifications = list(self.db.scalars(
            select(Notification.type).where(Notification.user_id == self.recruiter.id)
        ))
        self.assertEqual(recruiter_notifications, ["interview_time_confirmed"])

    def test_ownership_option_and_double_confirmation_are_protected(self):
        application = self.create_application()
        other_application = self.create_application()
        third_application = self.create_application(job=self.other_job)

        with self.assertRaises(HTTPException) as wrong_recruiter:
            create_interview_proposal(self.proposal_data(third_application), self.db, self.recruiter)
        self.assertEqual(wrong_recruiter.exception.status_code, 404)

        first = create_interview_proposal(self.proposal_data(application), self.db, self.recruiter)
        second = create_interview_proposal(self.proposal_data(other_application), self.db, self.recruiter)
        with self.assertRaises(HTTPException) as wrong_candidate:
            interview_proposal(first["id"], self.db, self.other_candidate)
        self.assertEqual(wrong_candidate.exception.status_code, 404)
        with self.assertRaises(HTTPException) as wrong_candidate_confirm:
            confirm_interview_proposal(
                first["id"],
                InterviewProposalConfirmIn(option_id=first["options"][0]["id"]),
                self.db,
                self.other_candidate,
            )
        self.assertEqual(wrong_candidate_confirm.exception.status_code, 404)
        with self.assertRaises(HTTPException) as foreign_option:
            confirm_interview_proposal(
                first["id"],
                InterviewProposalConfirmIn(option_id=second["options"][0]["id"]),
                self.db,
                self.candidate,
            )
        self.assertEqual(foreign_option.exception.status_code, 400)

        option_id = first["options"][0]["id"]
        confirm_interview_proposal(
            first["id"], InterviewProposalConfirmIn(option_id=option_id), self.db, self.candidate
        )
        with self.assertRaises(HTTPException) as duplicate_confirmation:
            confirm_interview_proposal(
                first["id"], InterviewProposalConfirmIn(option_id=option_id), self.db, self.candidate
            )
        self.assertEqual(duplicate_confirmation.exception.status_code, 409)
        self.assertEqual(self.db.scalar(select(func.count(Interview.id)).where(
            Interview.application_id == application.id
        )), 1)

    def test_recruiter_pending_list_is_owned_and_candidate_is_forbidden(self):
        own_application = self.create_application()
        other_application = self.create_application(candidate=self.other_candidate, job=self.other_job)
        own_proposal = create_interview_proposal(
            self.proposal_data(own_application), self.db, self.recruiter
        )
        other_proposal = create_interview_proposal(
            self.proposal_data(other_application), self.db, self.other_recruiter
        )

        own_results = recruiter_interview_proposals(self.db, self.recruiter)
        other_results = recruiter_interview_proposals(self.db, self.other_recruiter)
        self.assertEqual([item["id"] for item in own_results], [own_proposal["id"]])
        self.assertEqual([item["id"] for item in other_results], [other_proposal["id"]])
        self.assertEqual(len(own_results[0]["options"]), 3)
        self.assertNotIn(other_proposal["candidate_name"], [item["candidate_name"] for item in own_results])

        with self.assertRaises(HTTPException) as candidate_forbidden:
            require_role("recruiter")(self.candidate)
        self.assertEqual(candidate_forbidden.exception.status_code, 403)

    def test_proposal_validation_and_duplicate_guards(self):
        application = self.create_application()
        with self.assertRaises(ValidationError):
            InterviewProposalCreate(
                application_id=application.id,
                proposed_times=[datetime.utcnow() + timedelta(days=1)],
                duration_minutes=45,
            )
        with self.assertRaises(ValidationError):
            InterviewProposalCreate(
                application_id=application.id,
                proposed_times=[datetime.utcnow() + timedelta(days=day) for day in (1, 2, 3)],
                duration_minutes=5,
            )

        duplicate_time = datetime.utcnow() + timedelta(days=1)
        with self.assertRaises(HTTPException) as duplicate_options:
            create_interview_proposal(
                self.proposal_data(application, [duplicate_time, duplicate_time, duplicate_time]),
                self.db,
                self.recruiter,
            )
        self.assertEqual(duplicate_options.exception.status_code, 400)
        with self.assertRaises(HTTPException) as past_option:
            create_interview_proposal(
                self.proposal_data(application, [
                    datetime.utcnow() - timedelta(days=1),
                    datetime.utcnow() + timedelta(days=1),
                    datetime.utcnow() + timedelta(days=2),
                ]),
                self.db,
                self.recruiter,
            )
        self.assertEqual(past_option.exception.status_code, 400)

        created = create_interview_proposal(self.proposal_data(application), self.db, self.recruiter)
        with self.assertRaises(HTTPException) as duplicate_proposal:
            create_interview_proposal(self.proposal_data(application), self.db, self.recruiter)
        self.assertEqual(duplicate_proposal.exception.status_code, 409)
        self.assertEqual(self.db.scalar(select(func.count(InterviewProposal.id)).where(
            InterviewProposal.application_id == application.id
        )), 1)
        self.assertEqual(created["status"], "pending")

        active_application = self.create_application()
        self.db.add(Interview(
            application_id=active_application.id,
            scheduled_at=datetime.utcnow() + timedelta(days=1),
            created_by=self.recruiter.id,
        ))
        self.db.commit()
        with self.assertRaises(HTTPException) as active_interview:
            create_interview_proposal(self.proposal_data(active_application), self.db, self.recruiter)
        self.assertEqual(active_interview.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
