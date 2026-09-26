import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_

from .database import get_db
from .models import User, Job, Resume, Application, Company, Interview, Evaluation
from .schemas import (
    RegisterIn, LoginIn, Token, UserOut,
    CompanyIn, CompanyOut,
    JobCreate, JobUpdate, JobOut,
    ResumeOut,
    ApplicationOut, StatusUpdateIn,
    InterviewCreate, InterviewOut,
    EvaluationCreate, EvaluationOut,
    AdminUserUpdate,
)
from .security import hash_password, verify_password, create_access_token
from .deps import current_user, require_role
from .ai_service import (
    extract_text_from_file, extract_skills, extract_experience,
    extract_education, extract_projects, match_candidate, recommend_jobs_for_resume,
)
from .config import settings, MAX_UPLOAD_BYTES

api = APIRouter(prefix="/api")
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

VALID_STATUSES = ["applied", "screening", "interview", "offer", "hired", "rejected"]


# =====================================================================
# AUTH
# =====================================================================
@api.post("/auth/register", response_model=Token)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if data.role not in ("candidate", "recruiter"):
        raise HTTPException(400, "Invalid role. Use 'candidate' or 'recruiter'.")
    if db.scalar(select(User).where(User.email == data.email)):
        raise HTTPException(409, "This email is already registered")
    u = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        phone=data.phone,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    token = create_access_token({"sub": str(u.id), "role": u.role})
    return {"access_token": token, "token_type": "bearer", "user": u}


@api.post("/auth/login", response_model=Token)
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == data.email))
    if not u or not verify_password(data.password, u.hashed_password):
        raise HTTPException(401, "Incorrect email or password")
    if not u.is_active:
        raise HTTPException(403, "This account has been deactivated")
    token = create_access_token({"sub": str(u.id), "role": u.role})
    return {"access_token": token, "token_type": "bearer", "user": u}


@api.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


# =====================================================================
# COMPANY
# =====================================================================
@api.get("/company/me", response_model=CompanyOut)
def get_my_company(db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    company = db.scalar(select(Company).where(Company.recruiter_id == user.id))
    if not company:
        raise HTTPException(404, "No company profile yet")
    return company


@api.put("/company/me", response_model=CompanyOut)
def upsert_my_company(data: CompanyIn, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    company = db.scalar(select(Company).where(Company.recruiter_id == user.id))
    if company:
        for k, v in data.model_dump().items():
            setattr(company, k, v)
    else:
        company = Company(**data.model_dump(), recruiter_id=user.id)
        db.add(company)
    db.commit()
    db.refresh(company)
    return company


@api.get("/companies", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    return list(db.scalars(select(Company)))


# =====================================================================
# JOBS
# =====================================================================
def _job_out(job: Job, db: Session) -> dict:
    count = db.scalar(select(func.count(Application.id)).where(Application.job_id == job.id)) or 0
    return {
        "id": job.id, "title": job.title, "description": job.description, "skills": job.skills,
        "min_experience": job.min_experience, "location": job.location,
        "employment_type": job.employment_type, "salary_range": job.salary_range,
        "status": job.status, "recruiter_id": job.recruiter_id, "company_id": job.company_id,
        "company_name": job.company.name if job.company else None,
        "applicants_count": count, "created_at": job.created_at,
    }


@api.get("/jobs", response_model=list[JobOut])
def list_jobs(
    q: str = Query(default=""),
    location: str = Query(default=""),
    status: str = Query(default="open"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    stmt = select(Job)
    if status and status != "all":
        stmt = stmt.where(Job.status == status)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Job.title).like(like), func.lower(Job.skills).like(like),
                               func.lower(Job.description).like(like)))
    if location:
        stmt = stmt.where(func.lower(Job.location).like(f"%{location.lower()}%"))
    stmt = stmt.order_by(Job.created_at.desc())
    jobs = list(db.scalars(stmt))
    return [_job_out(j, db) for j in jobs]


@api.get("/jobs/mine", response_model=list[JobOut])
def list_my_jobs(db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    jobs = list(db.scalars(select(Job).where(Job.recruiter_id == user.id).order_by(Job.created_at.desc())))
    return [_job_out(j, db) for j in jobs]


@api.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _job_out(job, db)


@api.post("/jobs", response_model=JobOut)
def create_job(data: JobCreate, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    company_id = data.company_id
    if company_id is None:
        company = db.scalar(select(Company).where(Company.recruiter_id == user.id))
        if not company:
            company = Company(name=f"{user.full_name} Company", recruiter_id=user.id)
            db.add(company)
            db.commit()
            db.refresh(company)
        company_id = company.id
    job = Job(**data.model_dump(exclude={"company_id"}), recruiter_id=user.id, company_id=company_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    return _job_out(job, db)


@api.put("/jobs/{job_id}", response_model=JobOut)
def update_job(job_id: int, data: JobUpdate, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    job = db.get(Job, job_id)
    if not job or job.recruiter_id != user.id:
        raise HTTPException(404, "Job not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(job, k, v)
    db.commit()
    db.refresh(job)
    return _job_out(job, db)


@api.delete("/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    job = db.get(Job, job_id)
    if not job or job.recruiter_id != user.id:
        raise HTTPException(404, "Job not found")
    db.delete(job)
    db.commit()
    return {"message": "Job deleted"}


# =====================================================================
# RESUMES
# =====================================================================
@api.post("/resumes/upload", response_model=ResumeOut)
def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    ext = (file.filename or "").lower().rsplit(".", 1)[-1]
    if ext not in ("pdf", "docx"):
        raise HTTPException(400, "Only PDF and DOCX files are supported")

    contents = file.file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large. Maximum size is {settings.MAX_UPLOAD_MB} MB")

    name = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(settings.UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(contents)

    try:
        text = extract_text_from_file(path, file.filename or name)
    except Exception as e:
        raise HTTPException(400, str(e))

    skills = extract_skills(text)
    exp = extract_experience(text)
    education = extract_education(text)
    projects = extract_projects(text)
    summary = (
        f"CV được phân tích tự động: phát hiện {len(skills)} kỹ năng, "
        f"{exp:g} năm kinh nghiệm, {len(education)} mục học vấn và {len(projects)} dự án."
    )

    resume = Resume(
        candidate_id=user.id, filename=file.filename or name, raw_text=text,
        skills=", ".join(skills), experience_years=exp,
        education="\n".join(education), projects="\n".join(projects), summary=summary,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return {
        "id": resume.id, "filename": resume.filename, "skills": skills, "experience_years": resume.experience_years,
        "education": education, "projects": projects, "summary": resume.summary, "created_at": resume.created_at,
    }


@api.get("/resumes/me", response_model=list[ResumeOut])
def my_resumes(db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    rows = list(db.scalars(select(Resume).where(Resume.candidate_id == user.id).order_by(Resume.created_at.desc())))
    return [
        {
            "id": r.id, "filename": r.filename, "skills": [x for x in r.skills.split(", ") if x],
            "experience_years": r.experience_years,
            "education": [x for x in r.education.split("\n") if x],
            "projects": [x for x in r.projects.split("\n") if x],
            "summary": r.summary, "created_at": r.created_at,
        }
        for r in rows
    ]


# =====================================================================
# APPLICATIONS
# =====================================================================
def _app_out(a: Application) -> dict:
    return {
        "id": a.id, "job_id": a.job_id, "job_title": a.job.title if a.job else None,
        "candidate_id": a.candidate_id, "candidate_name": a.candidate.full_name if a.candidate else None,
        "candidate_email": a.candidate.email if a.candidate else None,
        "skill_score": a.skill_score, "experience_score": a.experience_score,
        "semantic_score": a.semantic_score, "project_score": a.project_score, "final_score": a.final_score,
        "missing_skills": [x for x in a.missing_skills.split(", ") if x],
        "explanation": a.explanation, "status": a.status, "created_at": a.created_at,
    }


@api.post("/jobs/{job_id}/apply")
def apply(job_id: int, db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "open":
        raise HTTPException(400, "This job is no longer accepting applications")
    resume = db.scalar(select(Resume).where(Resume.candidate_id == user.id).order_by(Resume.created_at.desc()))
    if not resume:
        raise HTTPException(400, "Please upload a CV before applying")
    if db.scalar(select(Application).where(Application.job_id == job_id, Application.candidate_id == user.id)):
        raise HTTPException(409, "You have already applied to this job")

    skills = [x for x in resume.skills.split(", ") if x]
    m = match_candidate(job.description, job.skills, job.min_experience, resume.raw_text, skills, resume.experience_years)
    application = Application(
        candidate_id=user.id, job_id=job_id, resume_id=resume.id,
        skill_score=m["skill_score"], experience_score=m["experience_score"],
        semantic_score=m["semantic_score"], project_score=m["project_score"], final_score=m["final_score"],
        missing_skills=", ".join(m["missing_skills"]), explanation=m["explanation"],
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return {"message": "Applied successfully", "application_id": application.id, "match": m}


@api.get("/jobs/{job_id}/applications", response_model=list[ApplicationOut])
def job_applications(job_id: int, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    job = db.get(Job, job_id)
    if not job or job.recruiter_id != user.id:
        raise HTTPException(404, "Job not found")
    apps = list(db.scalars(select(Application).where(Application.job_id == job_id).order_by(Application.final_score.desc())))
    return [_app_out(a) for a in apps]


@api.get("/applications/me", response_model=list[ApplicationOut])
def my_applications(db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    apps = list(db.scalars(select(Application).where(Application.candidate_id == user.id).order_by(Application.created_at.desc())))
    return [_app_out(a) for a in apps]


@api.patch("/applications/{application_id}/status", response_model=ApplicationOut)
def update_application_status(application_id: int, data: StatusUpdateIn, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    if data.status not in VALID_STATUSES:
        raise HTTPException(400, f"Status must be one of {VALID_STATUSES}")
    a = db.get(Application, application_id)
    if not a or a.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    a.status = data.status
    a.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(a)
    return _app_out(a)


# =====================================================================
# AI JOB RECOMMENDATIONS
# =====================================================================
@api.get("/recommendations")
def recommend_jobs(limit: int = 5, db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    resume = db.scalar(select(Resume).where(Resume.candidate_id == user.id).order_by(Resume.created_at.desc()))
    if not resume:
        raise HTTPException(400, "Upload a CV first to get AI job recommendations")
    skills = [x for x in resume.skills.split(", ") if x]
    open_jobs = list(db.scalars(select(Job).where(Job.status == "open")))
    already_applied = {a.job_id for a in db.scalars(select(Application).where(Application.candidate_id == user.id))}
    open_jobs = [j for j in open_jobs if j.id not in already_applied]
    ranked = recommend_jobs_for_resume(resume.raw_text, skills, resume.experience_years, open_jobs)
    results = []
    for item in ranked[:limit]:
        job = item["job"]
        m = item["match"]
        results.append({
            "job": _job_out(job, db),
            "final_score": m["final_score"],
            "skill_score": m["skill_score"],
            "missing_skills": m["missing_skills"],
            "explanation": m["explanation"],
        })
    return results


# =====================================================================
# INTERVIEWS
# =====================================================================
def _interview_out(i: Interview) -> dict:
    return {
        "id": i.id, "application_id": i.application_id, "scheduled_at": i.scheduled_at,
        "duration_minutes": i.duration_minutes, "mode": i.mode, "location": i.location,
        "notes": i.notes, "status": i.status,
        "job_title": i.application.job.title if i.application and i.application.job else None,
        "candidate_name": i.application.candidate.full_name if i.application and i.application.candidate else None,
    }


@api.post("/interviews", response_model=InterviewOut)
def schedule_interview(data: InterviewCreate, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    application = db.get(Application, data.application_id)
    if not application or application.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    interview = Interview(
        application_id=data.application_id, scheduled_at=data.scheduled_at,
        duration_minutes=data.duration_minutes, mode=data.mode, location=data.location,
        notes=data.notes, created_by=user.id,
    )
    application.status = "interview"
    db.add(interview)
    db.commit()
    db.refresh(interview)
    return _interview_out(interview)


@api.get("/interviews/me", response_model=list[InterviewOut])
def my_interviews(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "candidate":
        rows = list(db.scalars(
            select(Interview).join(Application).where(Application.candidate_id == user.id)
            .order_by(Interview.scheduled_at)
        ))
    elif user.role == "recruiter":
        rows = list(db.scalars(
            select(Interview).where(Interview.created_by == user.id).order_by(Interview.scheduled_at)
        ))
    else:
        rows = list(db.scalars(select(Interview).order_by(Interview.scheduled_at)))
    return [_interview_out(i) for i in rows]


@api.patch("/interviews/{interview_id}/status")
def update_interview_status(interview_id: int, data: StatusUpdateIn, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    interview = db.get(Interview, interview_id)
    if not interview or interview.created_by != user.id:
        raise HTTPException(404, "Interview not found")
    if data.status not in ("scheduled", "completed", "cancelled"):
        raise HTTPException(400, "Status must be scheduled, completed or cancelled")
    interview.status = data.status
    db.commit()
    return {"message": "Interview updated"}


# =====================================================================
# EVALUATIONS
# =====================================================================
@api.post("/evaluations", response_model=EvaluationOut)
def create_evaluation(data: EvaluationCreate, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    application = db.get(Application, data.application_id)
    if not application or application.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    if not (1 <= data.rating <= 5):
        raise HTTPException(400, "Rating must be between 1 and 5")
    evaluation = Evaluation(
        application_id=data.application_id, recruiter_id=user.id, rating=data.rating,
        strengths=data.strengths, concerns=data.concerns, comment=data.comment,
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)
    return evaluation


@api.get("/applications/{application_id}/evaluations", response_model=list[EvaluationOut])
def list_evaluations(application_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    application = db.get(Application, application_id)
    if not application:
        raise HTTPException(404, "Application not found")
    if user.role == "recruiter" and application.job.recruiter_id != user.id:
        raise HTTPException(403, "Forbidden")
    if user.role == "candidate" and application.candidate_id != user.id:
        raise HTTPException(403, "Forbidden")
    rows = list(db.scalars(select(Evaluation).where(Evaluation.application_id == application_id).order_by(Evaluation.created_at.desc())))
    return rows


# =====================================================================
# STATS / DASHBOARDS
# =====================================================================
@api.get("/stats/candidate")
def candidate_stats(db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    apps = list(db.scalars(select(Application).where(Application.candidate_id == user.id)))
    by_status = {}
    for a in apps:
        by_status[a.status] = by_status.get(a.status, 0) + 1
    avg_score = round(sum(a.final_score for a in apps) / len(apps), 2) if apps else 0
    resumes_count = db.scalar(select(func.count(Resume.id)).where(Resume.candidate_id == user.id)) or 0
    return {
        "total_applications": len(apps), "by_status": by_status,
        "average_match_score": avg_score, "resumes_uploaded": resumes_count,
    }


@api.get("/stats/recruiter")
def recruiter_stats(db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    jobs = list(db.scalars(select(Job).where(Job.recruiter_id == user.id)))
    job_ids = [j.id for j in jobs]
    apps = list(db.scalars(select(Application).where(Application.job_id.in_(job_ids)))) if job_ids else []
    by_status = {}
    for a in apps:
        by_status[a.status] = by_status.get(a.status, 0) + 1
    avg_score = round(sum(a.final_score for a in apps) / len(apps), 2) if apps else 0
    return {
        "total_jobs": len(jobs), "open_jobs": len([j for j in jobs if j.status == "open"]),
        "total_applications": len(apps), "by_status": by_status, "average_match_score": avg_score,
        "top_candidates": [
            {"candidate_name": a.candidate.full_name, "job_title": a.job.title, "final_score": a.final_score}
            for a in sorted(apps, key=lambda x: x.final_score, reverse=True)[:5]
        ],
    }


@api.get("/stats/admin")
def admin_stats(db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    total_users = db.scalar(select(func.count(User.id))) or 0
    by_role = {}
    for u in db.scalars(select(User)):
        by_role[u.role] = by_role.get(u.role, 0) + 1
    total_jobs = db.scalar(select(func.count(Job.id))) or 0
    open_jobs = db.scalar(select(func.count(Job.id)).where(Job.status == "open")) or 0
    total_companies = db.scalar(select(func.count(Company.id))) or 0
    total_applications = db.scalar(select(func.count(Application.id))) or 0
    by_status = {}
    for a in db.scalars(select(Application)):
        by_status[a.status] = by_status.get(a.status, 0) + 1
    return {
        "total_users": total_users, "users_by_role": by_role,
        "total_jobs": total_jobs, "open_jobs": open_jobs,
        "total_companies": total_companies,
        "total_applications": total_applications, "applications_by_status": by_status,
    }


# =====================================================================
# ADMIN
# =====================================================================
@api.get("/admin/users", response_model=list[UserOut])
def admin_list_users(db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


@api.patch("/admin/users/{user_id}", response_model=UserOut)
def admin_update_user(user_id: int, data: AdminUserUpdate, db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(target, k, v)
    db.commit()
    db.refresh(target)
    return target


@api.get("/admin/jobs", response_model=list[JobOut])
def admin_list_jobs(db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    jobs = list(db.scalars(select(Job).order_by(Job.created_at.desc())))
    return [_job_out(j, db) for j in jobs]
