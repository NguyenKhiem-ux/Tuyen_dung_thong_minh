import json
import re
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator
from datetime import datetime


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "candidate"
    phone: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    phone: str = ""
    is_active: bool = True
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Company ----------
class CompanyIn(BaseModel):
    name: str
    description: str = ""
    website: str = ""
    location: str = ""
    industry: str = ""


class CompanyOut(CompanyIn):
    id: int
    recruiter_id: int
    model_config = ConfigDict(from_attributes=True)


# ---------- Job ----------
class JobCreate(BaseModel):
    title: str
    description: str
    skills: str = ""
    min_experience: float = 0
    location: str = "Remote"
    employment_type: str = "Full-time"
    salary_range: str = ""


class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    skills: Optional[str] = None
    min_experience: Optional[float] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_range: Optional[str] = None
    status: Optional[str] = None


class JobOut(BaseModel):
    id: int
    title: str
    description: str
    skills: str
    min_experience: float
    location: str
    employment_type: str
    salary_range: str
    status: str
    recruiter_id: int
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    applicants_count: int = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------- Resume ----------
class ResumeOut(BaseModel):
    id: int
    filename: str
    skills: list[str]
    experience_years: float
    education: list[str] = []
    projects: list[str] = []
    summary: str
    created_at: datetime
    is_active: bool = False


CVShortText = Annotated[str, StringConstraints(max_length=200)]
CVLongText = Annotated[str, StringConstraints(max_length=4000)]
CVUrl = Annotated[str, StringConstraints(max_length=500)]
CVSkill = Annotated[str, StringConstraints(max_length=100)]
CVGPA = Annotated[str, StringConstraints(max_length=20, pattern=r"^(?:|\d+(?:\.\d+)?/\d+(?:\.\d+)?)$")]
_HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")


class CVPersonal(BaseModel):
    full_name: CVShortText = ""
    desired_position: CVShortText = ""
    email: EmailStr | Literal[""] = ""
    phone: CVShortText = ""
    address: CVShortText = ""
    birth_date: Annotated[str, StringConstraints(max_length=30)] = ""
    github: CVUrl = ""
    linkedin: CVUrl = ""
    portfolio: CVUrl = ""


class CVEducation(BaseModel):
    school: CVShortText = ""
    major: CVShortText = ""
    start_date: CVShortText = ""
    end_date: CVShortText = ""
    gpa: CVGPA = ""
    # Legacy fields remain accepted and stored, but are no longer rendered.
    period: CVShortText = ""
    description: CVLongText = ""


class CVExperience(BaseModel):
    company: CVShortText = ""
    position: CVShortText = ""
    period: CVShortText = ""
    description: CVLongText = ""


class CVProject(BaseModel):
    name: CVShortText = ""
    technologies: CVShortText = ""
    role: CVShortText = ""
    description: CVLongText = ""


class CVCertificate(BaseModel):
    name: CVShortText = ""
    issuer: CVShortText = ""
    period: CVShortText = ""


class CVAward(BaseModel):
    name: CVShortText = ""
    issuer: CVShortText = ""
    period: CVShortText = ""
    description: CVLongText = ""


class CVContent(BaseModel):
    personal: CVPersonal = Field(default_factory=CVPersonal)
    objective: CVLongText = ""
    summary: CVLongText = ""
    education: list[CVEducation] = Field(default_factory=list, max_length=12)
    experience: list[CVExperience] = Field(default_factory=list, max_length=20)
    skills: list[CVSkill] = Field(default_factory=list, max_length=60)
    hobbies: list[CVSkill] = Field(default_factory=list, max_length=20)
    projects: list[CVProject] = Field(default_factory=list, max_length=20)
    awards: list[CVAward] = Field(default_factory=list, max_length=20)
    certificates: list[CVCertificate] = Field(default_factory=list, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def reject_html(cls, value):
        def walk(item):
            if isinstance(item, str) and _HTML_TAG.search(item):
                raise ValueError("HTML is not allowed in CV content")
            if isinstance(item, dict):
                for child in item.values():
                    walk(child)
            elif isinstance(item, list):
                for child in item:
                    walk(child)

        walk(value)
        return value

    @model_validator(mode="after")
    def limit_payload_size(self):
        if len(json.dumps(self.model_dump(mode="json"), ensure_ascii=False).encode("utf-8")) > 100_000:
            raise ValueError("CV content is too large")
        return self


class CVDraftIn(BaseModel):
    title: str = Field(default="CV chưa đặt tên", min_length=1, max_length=160)
    template_key: Literal["olive_sidebar", "navy"] = "olive_sidebar"
    content: CVContent


class CVDraftOut(CVDraftIn):
    id: int
    candidate_id: int
    last_export_resume_id: int | None = None
    has_portrait: bool = False
    portrait_version: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------- Application ----------
class ApplicationOut(BaseModel):
    id: int
    job_id: int
    job_title: Optional[str] = None
    candidate_id: int
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    skill_score: float
    experience_score: float
    semantic_score: float
    project_score: float
    final_score: float
    missing_skills: list[str] = []
    explanation: str
    status: str
    created_at: datetime


class ApplicationStatusUpdateIn(BaseModel):
    status: Literal["applied", "screening", "interview", "offer", "hired", "rejected"]
    reason: Optional[str] = None
    candidate_message: Optional[str] = Field(default=None, max_length=4000)


class ApplicationMessageCreate(BaseModel):
    candidate_message: str = Field(min_length=1, max_length=4000)


class ApplicationStatusHistoryOut(BaseModel):
    id: int
    application_id: int
    old_status: Optional[str] = None
    new_status: str
    changed_by: int
    changed_by_name: Optional[str] = None
    reason: Optional[str] = None
    candidate_message: Optional[str] = None
    changed_at: datetime


# ---------- Interview ----------
class InterviewCreate(BaseModel):
    application_id: int
    scheduled_at: datetime
    duration_minutes: int = 45
    mode: str = "online"
    location: str = ""
    notes: str = ""


class InterviewOut(BaseModel):
    id: int
    application_id: int
    scheduled_at: datetime
    duration_minutes: int
    mode: str
    location: str
    notes: str
    status: str
    job_title: Optional[str] = None
    candidate_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class InterviewStatusUpdateIn(BaseModel):
    status: Literal["scheduled", "completed", "cancelled"]


class InterviewProposalCreate(BaseModel):
    application_id: int
    proposed_times: list[datetime] = Field(min_length=3, max_length=3)
    duration_minutes: int = Field(default=45, ge=15, le=480)
    mode: Literal["online", "onsite"] = "online"
    location: str = ""
    notes: str = ""
    candidate_message: Optional[str] = Field(default=None, max_length=4000)


class InterviewProposalConfirmIn(BaseModel):
    option_id: int


class InterviewTimeOptionOut(BaseModel):
    id: int
    scheduled_at: datetime
    model_config = ConfigDict(from_attributes=True)


class InterviewProposalOut(BaseModel):
    id: int
    application_id: int
    recruiter_id: int
    status: Literal["pending", "confirmed", "cancelled"]
    selected_option_id: Optional[int] = None
    duration_minutes: int
    mode: str
    location: str
    notes: str
    job_title: Optional[str] = None
    company_name: Optional[str] = None
    candidate_name: Optional[str] = None
    options: list[InterviewTimeOptionOut]
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- Notification ----------
class NotificationOut(BaseModel):
    id: int
    user_id: int
    application_id: Optional[int] = None
    type: Literal[
        "application_received",
        "application_submitted",
        "application_status_changed",
        "application_message_received",
        "interview_scheduled",
        "interview_updated",
        "interview_time_selection_requested",
        "interview_time_confirmed",
    ]
    title: str
    message: str
    is_read: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------- Evaluation ----------
class EvaluationCreate(BaseModel):
    application_id: int
    rating: int = 3
    strengths: str = ""
    concerns: str = ""
    comment: str = ""


class EvaluationOut(BaseModel):
    id: int
    application_id: int
    recruiter_id: int
    rating: int
    strengths: str
    concerns: str
    comment: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------- Admin ----------
class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None


# ---------- AI ----------
class AIFeedbackIn(BaseModel):
    label: str  # agree | too_high | too_low
    note: str = ""


class AIFeedbackOut(BaseModel):
    application_id: int
    label: str
    note: str
    score_snapshot: float
    updated_at: datetime


class ResumeTipOut(BaseModel):
    code: str
    severity: str
    message: str


class ResumeInsightsOut(BaseModel):
    quality_score: int
    tips: list[ResumeTipOut]
    skills: list[str]
    experience_years: float
    engine_version: str


class RecommendationRequest(BaseModel):
    resume_id: int
    position: str = Field(min_length=1, max_length=255)
    mode: Literal["single", "position"]
    job_id: Optional[int] = None
    limit: int = Field(default=6, ge=1, le=10)

    @model_validator(mode="after")
    def validate_selection(self):
        self.position = self.position.strip()
        if not self.position:
            raise ValueError("position is required")
        if self.mode == "single" and self.job_id is None:
            raise ValueError("job_id is required in single mode")
        if self.mode == "position" and self.job_id is not None:
            raise ValueError("job_id is only allowed in single mode")
        return self
