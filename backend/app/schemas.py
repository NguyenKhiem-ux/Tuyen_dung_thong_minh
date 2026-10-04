from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Literal, Optional
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


class ApplicationStatusHistoryOut(BaseModel):
    id: int
    application_id: int
    old_status: str
    new_status: str
    changed_by: int
    changed_by_name: Optional[str] = None
    reason: Optional[str] = None
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
