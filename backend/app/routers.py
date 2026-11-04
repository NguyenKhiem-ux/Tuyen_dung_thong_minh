import hashlib
import io
import json
import logging
import os
import re
import uuid
import warnings
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import get_db
from .models import (
    User, Job, Resume, CVDraft, CVDraftExport, Application, ApplicationStatusHistory,
    Company, Interview, InterviewProposal, InterviewTimeOption, Notification, Evaluation, AIFeedback,
)
from .schemas import (
    RegisterIn, LoginIn, Token, UserOut,
    CompanyIn, CompanyOut,
    JobCreate, JobUpdate, JobOut,
    ResumeOut, CVDraftIn, CVDraftOut,
    ApplicationOut, ApplicationStatusUpdateIn, ApplicationStatusHistoryOut, ApplicationMessageCreate,
    InterviewCreate, InterviewOut, InterviewStatusUpdateIn,
    InterviewProposalCreate, InterviewProposalConfirmIn, InterviewProposalOut,
    NotificationOut,
    EvaluationCreate, EvaluationOut,
    AdminUserUpdate,
    AIFeedbackIn, AIFeedbackOut, ResumeInsightsOut, RecommendationRequest,
)
from .security import hash_password, verify_password, create_access_token
from .deps import current_user, require_role
from .ai_service import (
    extract_text_from_file, extract_skills, extract_experience,
    extract_education, extract_projects, match_candidate, recommend_jobs_for_resume, ScoringContext,
    resume_tips,
)
from .config import settings, MAX_UPLOAD_BYTES

api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

MAX_PORTRAIT_BYTES = 5 * 1024 * 1024
MAX_PORTRAIT_PIXELS = 16_000_000
PORTRAIT_SIZE = 800
ALLOWED_PORTRAIT_FORMATS = {"JPEG", "PNG", "WEBP"}
CV_EXPORT_VERSION = 2

APPLICATION_TRANSITIONS = {
    "applied": {"screening", "rejected"},
    "screening": {"interview", "rejected"},
    "interview": {"offer", "rejected"},
    "offer": {"hired", "rejected"},
    "hired": set(),
    "rejected": set(),
}

APPLICATION_STATUS_TITLES = {
    "screening": "Đơn ứng tuyển đang được sàng lọc",
    "interview": "Bạn đã vào vòng phỏng vấn",
    "offer": "Bạn đã nhận được Offer",
    "hired": "Chúc mừng! Bạn đã được tuyển",
    "rejected": "Cập nhật kết quả ứng tuyển",
}


def _save_notifications(db: Session, *notifications: Notification) -> None:
    if not notifications:
        return
    try:
        db.add_all(notifications)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Could not persist notifications")


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
):
    stmt = select(Job)
    if status and status != "all":
        stmt = stmt.where(Job.status == status)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.outerjoin(Company, Job.company_id == Company.id)
        stmt = stmt.where(or_(func.lower(Job.title).like(like), func.lower(Job.skills).like(like),
                               func.lower(Job.description).like(like), func.lower(Company.name).like(like)))
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
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _job_out(job, db)


@api.post("/jobs", response_model=JobOut)
def create_job(data: JobCreate, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    company = db.scalar(select(Company).where(Company.recruiter_id == user.id))
    if not company:
        raise HTTPException(status_code=409, detail="Vui lòng tạo hồ sơ công ty trước khi đăng tin tuyển dụng.")
    job = Job(**data.model_dump(), recruiter_id=user.id, company_id=company.id)
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
def _candidate_resume(db: Session, user: User, resume_id: int | None = None) -> Resume | None:
    if resume_id is not None:
        return db.scalar(select(Resume).where(Resume.id == resume_id, Resume.candidate_id == user.id))
    if user.active_resume_id:
        active = db.scalar(
            select(Resume).where(Resume.id == user.active_resume_id, Resume.candidate_id == user.id)
        )
        if active:
            return active
    return db.scalar(
        select(Resume)
        .where(Resume.candidate_id == user.id)
        .order_by(Resume.created_at.desc(), Resume.id.desc())
    )


def _resume_out(resume: Resume, active_resume_id: int | None = None) -> dict:
    return {
        "id": resume.id,
        "filename": resume.filename,
        "skills": [item for item in resume.skills.split(", ") if item],
        "experience_years": resume.experience_years,
        "education": [item for item in resume.education.split("\n") if item],
        "projects": [item for item in resume.projects.split("\n") if item],
        "summary": resume.summary,
        "created_at": resume.created_at,
        "is_active": resume.id == active_resume_id,
    }


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
        os.remove(path)
        raise HTTPException(400, str(e))
    if len(text.strip()) < 20:
        os.remove(path)
        raise HTTPException(
            400,
            "Không đọc được văn bản từ CV (có thể là bản quét/ảnh). Hãy xuất lại CV dạng PDF có chữ, "
            "hoặc nhờ quản trị viên bật OCR (cài Tesseract).",
        )

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
    db.flush()
    user.active_resume_id = resume.id
    db.commit()
    db.refresh(resume)
    return _resume_out(resume, user.active_resume_id)


@api.get("/resumes/me", response_model=list[ResumeOut])
def my_resumes(db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    rows = list(
        db.scalars(
            select(Resume)
            .where(Resume.candidate_id == user.id)
            .order_by(Resume.created_at.desc(), Resume.id.desc())
        )
    )
    effective_active_id = user.active_resume_id or (rows[0].id if rows else None)
    return [_resume_out(resume, effective_active_id) for resume in rows]


@api.put("/resumes/{resume_id}/activate", response_model=ResumeOut)
def activate_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    resume = _candidate_resume(db, user, resume_id)
    if not resume:
        raise HTTPException(404, "Resume not found")
    user.active_resume_id = resume.id
    db.commit()
    return _resume_out(resume, resume.id)


def _draft_out(draft: CVDraft) -> dict:
    return {
        "id": draft.id,
        "candidate_id": draft.candidate_id,
        "title": draft.title,
        "template_key": draft.template_key,
        "content": draft.content,
        "last_export_resume_id": draft.exports[0].resume_id if draft.exports else None,
        "has_portrait": bool(draft.portrait_filename),
        "portrait_version": draft.portrait_sha256[:12] if draft.portrait_sha256 else None,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


def _owned_draft(db: Session, draft_id: int, user: User) -> CVDraft:
    draft = db.scalar(select(CVDraft).where(CVDraft.id == draft_id, CVDraft.candidate_id == user.id))
    if not draft:
        raise HTTPException(404, "CV draft not found")
    return draft


def _portrait_path(filename: str) -> Path:
    return Path(settings.UPLOAD_DIR) / "cv_portraits" / Path(filename).name


def _remove_portrait(filename: str | None) -> None:
    if not filename:
        return
    try:
        _portrait_path(filename).unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove obsolete CV portrait %s", filename, exc_info=True)


def _normalize_portrait(contents: bytes) -> bytes:
    if len(contents) > MAX_PORTRAIT_BYTES:
        raise HTTPException(413, "Portrait is larger than 5 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(contents)) as source:
                if source.format not in ALLOWED_PORTRAIT_FORMATS:
                    raise HTTPException(400, "Portrait must contain a real JPG, PNG or WebP image")
                if source.width * source.height > MAX_PORTRAIT_PIXELS:
                    raise HTTPException(400, "Portrait pixel dimensions are too large")
                if getattr(source, "n_frames", 1) != 1:
                    raise HTTPException(400, "Animated portraits are not supported")
                source.load()
                image = ImageOps.exif_transpose(source)
                if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
                    rgba = image.convert("RGBA")
                    clean = Image.new("RGB", rgba.size, "white")
                    clean.paste(rgba, mask=rgba.getchannel("A"))
                else:
                    clean = image.convert("RGB")
                side = min(clean.size)
                left = (clean.width - side) // 2
                top = (clean.height - side) // 2
                clean = clean.crop((left, top, left + side, top + side)).resize(
                    (PORTRAIT_SIZE, PORTRAIT_SIZE), Image.Resampling.LANCZOS
                )
                output = io.BytesIO()
                clean.save(output, format="JPEG", quality=90, optimize=True)
                return output.getvalue()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(400, "Portrait must contain a valid JPG, PNG or WebP image")


@api.post("/resume-drafts", response_model=CVDraftOut)
def create_cv_draft(
    data: CVDraftIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    draft = CVDraft(
        candidate_id=user.id,
        title=data.title.strip(),
        template_key=data.template_key,
        content=data.content.model_dump(mode="json"),
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return _draft_out(draft)


@api.get("/resume-drafts", response_model=list[CVDraftOut])
def list_cv_drafts(db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    drafts = list(
        db.scalars(
            select(CVDraft)
            .where(CVDraft.candidate_id == user.id)
            .order_by(CVDraft.updated_at.desc(), CVDraft.id.desc())
        )
    )
    return [_draft_out(draft) for draft in drafts]


@api.get("/resume-drafts/{draft_id}", response_model=CVDraftOut)
def get_cv_draft(
    draft_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    return _draft_out(_owned_draft(db, draft_id, user))


@api.put("/resume-drafts/{draft_id}", response_model=CVDraftOut)
def update_cv_draft(
    draft_id: int,
    data: CVDraftIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    draft = _owned_draft(db, draft_id, user)
    draft.title = data.title.strip()
    draft.template_key = data.template_key
    draft.content = data.content.model_dump(mode="json")
    draft.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(draft)
    return _draft_out(draft)


@api.delete("/resume-drafts/{draft_id}")
def delete_cv_draft(
    draft_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    draft = _owned_draft(db, draft_id, user)
    portrait_filename = draft.portrait_filename
    db.delete(draft)
    db.commit()
    _remove_portrait(portrait_filename)
    return {"message": "CV draft deleted"}


@api.post("/resume-drafts/{draft_id}/portrait", response_model=CVDraftOut)
def upload_cv_draft_portrait(
    draft_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    draft = _owned_draft(db, draft_id, user)
    normalized = _normalize_portrait(file.file.read(MAX_PORTRAIT_BYTES + 1))
    new_filename = f"{uuid.uuid4().hex}.jpg"
    new_path = _portrait_path(new_filename)
    try:
        new_path.parent.mkdir(parents=True, exist_ok=True)
        new_path.write_bytes(normalized)
    except OSError:
        _remove_portrait(new_filename)
        logger.exception("Could not write normalized CV portrait")
        raise HTTPException(500, "Could not store portrait")
    old_filename = draft.portrait_filename
    draft.portrait_filename = new_filename
    draft.portrait_mime = "image/jpeg"
    draft.portrait_sha256 = hashlib.sha256(normalized).hexdigest()
    draft.updated_at = datetime.utcnow()
    try:
        db.commit()
        db.refresh(draft)
    except SQLAlchemyError:
        db.rollback()
        _remove_portrait(new_filename)
        logger.exception("Could not save CV portrait metadata")
        raise HTTPException(500, "Could not save portrait")
    _remove_portrait(old_filename)
    return _draft_out(draft)


@api.get("/resume-drafts/{draft_id}/portrait")
def get_cv_draft_portrait(
    draft_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    draft = _owned_draft(db, draft_id, user)
    if not draft.portrait_filename:
        raise HTTPException(404, "CV portrait not found")
    path = _portrait_path(draft.portrait_filename)
    if not path.is_file():
        raise HTTPException(404, "CV portrait file not found")
    return FileResponse(
        path,
        media_type=draft.portrait_mime or "image/jpeg",
        filename="portrait.jpg",
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store"},
    )


@api.delete("/resume-drafts/{draft_id}/portrait", response_model=CVDraftOut)
def delete_cv_draft_portrait(
    draft_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    draft = _owned_draft(db, draft_id, user)
    old_filename = draft.portrait_filename
    draft.portrait_filename = None
    draft.portrait_mime = None
    draft.portrait_sha256 = None
    draft.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(draft)
    _remove_portrait(old_filename)
    return _draft_out(draft)


@api.post("/resume-drafts/{draft_id}/save-to-resumes", response_model=ResumeOut)
def save_cv_draft_to_resumes(
    draft_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    draft = _owned_draft(db, draft_id, user)
    content_hash = hashlib.sha256(
        json.dumps(
            {
                "export_version": CV_EXPORT_VERSION,
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
    existing_export = db.scalar(
        select(CVDraftExport).where(
            CVDraftExport.draft_id == draft.id,
            CVDraftExport.content_hash == content_hash,
        )
    )
    if existing_export:
        existing_resume = _candidate_resume(db, user, existing_export.resume_id)
        if existing_resume:
            user.active_resume_id = existing_resume.id
            db.commit()
            return _resume_out(existing_resume, existing_resume.id)

    contents = file.file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large. Maximum size is {settings.MAX_UPLOAD_MB} MB")
    if not contents.startswith(b"%PDF-"):
        raise HTTPException(400, "CV Builder export must be a valid PDF")

    stored_name = f"{uuid.uuid4().hex}.pdf"
    path = os.path.join(settings.UPLOAD_DIR, stored_name)
    with open(path, "wb") as output:
        output.write(contents)
    try:
        raw_text = extract_text_from_file(path, file.filename or stored_name)
    except Exception as exc:
        os.remove(path)
        raise HTTPException(400, f"Could not read generated PDF: {exc}")
    if len(raw_text.strip()) < 20:
        os.remove(path)
        raise HTTPException(400, "Generated PDF does not contain enough extractable text")

    skills = extract_skills(raw_text)
    experience = extract_experience(raw_text)
    education = extract_education(raw_text)
    projects = extract_projects(raw_text)
    display_title = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", draft.title).strip(" .") or "CV trực tuyến"
    resume = Resume(
        candidate_id=user.id,
        filename=f"{display_title[:150]}.pdf",
        raw_text=raw_text,
        skills=", ".join(skills),
        experience_years=experience,
        education="\n".join(education),
        projects="\n".join(projects),
        summary=f"CV tạo trực tuyến: {len(skills)} kỹ năng, {experience:g} năm kinh nghiệm.",
    )
    db.add(resume)
    try:
        db.flush()
        db.add(CVDraftExport(draft_id=draft.id, resume_id=resume.id, content_hash=content_hash))
        user.active_resume_id = resume.id
        db.commit()
    except IntegrityError:
        db.rollback()
        os.remove(path)
        existing_export = db.scalar(
            select(CVDraftExport).where(
                CVDraftExport.draft_id == draft.id,
                CVDraftExport.content_hash == content_hash,
            )
        )
        if existing_export and (existing_resume := _candidate_resume(db, user, existing_export.resume_id)):
            user.active_resume_id = existing_resume.id
            db.commit()
            return _resume_out(existing_resume, existing_resume.id)
        raise HTTPException(409, "This CV version was already saved")
    except SQLAlchemyError:
        db.rollback()
        os.remove(path)
        logger.exception("Could not save CV Builder PDF")
        raise HTTPException(500, "Could not save generated CV")
    db.refresh(resume)
    return _resume_out(resume, resume.id)


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


def _transition_application(
    a: Application,
    new_status: str,
    user: User,
    db: Session,
    reason: str | None = None,
    candidate_message: str | None = None,
):
    old_status = a.status
    if new_status not in APPLICATION_TRANSITIONS.get(old_status, set()):
        raise HTTPException(409, f"Không thể chuyển trạng thái từ {old_status} sang {new_status}.")
    if new_status == "rejected" and not (reason or "").strip():
        raise HTTPException(400, "Vui lòng nhập lý do từ chối ứng viên.")

    a.status = new_status
    a.updated_at = datetime.utcnow()
    db.add(ApplicationStatusHistory(
        application_id=a.id,
        old_status=old_status,
        new_status=new_status,
        changed_by=user.id,
        reason=(reason or "").strip() or None,
        candidate_message=(candidate_message or "").strip() or None,
    ))
    title = APPLICATION_STATUS_TITLES[new_status]
    message = f"{title} cho vị trí {a.job.title}."
    if new_status == "rejected" and reason:
        message += f" Lý do: {reason.strip()}"
    if candidate_message and candidate_message.strip():
        message += f" Lời nhắn: {candidate_message.strip()}"
    return Notification(
        user_id=a.candidate_id,
        application_id=a.id,
        type="application_status_changed",
        title=title,
        message=message,
    )


def _history_out(item: ApplicationStatusHistory, include_internal: bool = True) -> dict:
    return {
        "id": item.id,
        "application_id": item.application_id,
        "old_status": item.old_status,
        "new_status": item.new_status,
        "changed_by": item.changed_by,
        "changed_by_name": item.changed_by_user.full_name if item.changed_by_user else None,
        "reason": item.reason if include_internal or item.new_status == "rejected" else None,
        "candidate_message": item.candidate_message,
        "changed_at": item.changed_at,
    }


@api.post("/jobs/{job_id}/apply")
def apply(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
    resume_id: int | None = None,
):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "open":
        raise HTTPException(400, "This job is no longer accepting applications")
    resume = _candidate_resume(db, user, resume_id)
    if not resume:
        if resume_id is not None:
            raise HTTPException(404, "Resume not found")
        raise HTTPException(400, "Please upload a CV before applying")
    if db.scalar(select(Application).where(Application.job_id == job_id, Application.candidate_id == user.id)):
        raise HTTPException(409, "You have already applied to this job")

    skills = [x for x in resume.skills.split(", ") if x]
    scoring_context = ScoringContext.from_jobs(list(db.scalars(select(Job).where(Job.status == "open"))))
    m = match_candidate(
        job.description, job.skills, job.min_experience, resume.raw_text, skills, resume.experience_years,
        job_title=job.title, context=scoring_context, redact_terms=[user.full_name], with_evidence=False,
    )
    application = Application(
        candidate_id=user.id, job_id=job_id, resume_id=resume.id,
        skill_score=m["skill_score"], experience_score=m["experience_score"],
        semantic_score=m["semantic_score"], project_score=m["project_score"], final_score=m["final_score"],
        missing_skills=", ".join(m["missing_skills"]), explanation=m["explanation"],
    )
    db.add(application)
    db.flush()
    notifications = [
        Notification(
            user_id=user.id,
            application_id=application.id,
            type="application_submitted",
            title="Ứng tuyển thành công",
            message=f"Bạn đã ứng tuyển vị trí {job.title}.",
        ),
        Notification(
            user_id=job.recruiter_id,
            application_id=application.id,
            type="application_received",
            title="Có ứng viên mới",
            message=f"{user.full_name or user.email} đã ứng tuyển vị trí {job.title}.",
        ),
    ]
    if db.scalar(
        select(ApplicationStatusHistory.id)
        .where(ApplicationStatusHistory.application_id == application.id)
        .limit(1)
    ) is None:
        db.add(ApplicationStatusHistory(
            application_id=application.id,
            old_status=None,
            new_status="applied",
            changed_by=user.id,
            reason=None,
            candidate_message=None,
            changed_at=application.created_at,
        ))
    db.commit()
    _save_notifications(db, *notifications)
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
def update_application_status(application_id: int, data: ApplicationStatusUpdateIn, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    a = db.get(Application, application_id)
    if not a or a.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    notification = _transition_application(
        a,
        data.status,
        user,
        db,
        reason=data.reason,
        candidate_message=data.candidate_message,
    )
    db.commit()
    _save_notifications(db, notification)
    db.refresh(a)
    return _app_out(a)


@api.post("/applications/{application_id}/messages", response_model=ApplicationStatusHistoryOut)
def send_application_message(
    application_id: int,
    data: ApplicationMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("recruiter")),
):
    application = db.get(Application, application_id)
    if not application or application.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    candidate_message = data.candidate_message.strip()
    if not candidate_message:
        raise HTTPException(400, "Candidate message cannot be empty")
    history = ApplicationStatusHistory(
        application_id=application.id,
        old_status=application.status,
        new_status=application.status,
        changed_by=user.id,
        candidate_message=candidate_message,
    )
    db.add_all([
        history,
        Notification(
            user_id=application.candidate_id,
            application_id=application.id,
            type="application_message_received",
            title="Lời nhắn mới từ nhà tuyển dụng",
            message=f"{candidate_message} — {application.job.title}",
        ),
    ])
    db.commit()
    db.refresh(history)
    return _history_out(history)


@api.get("/applications/{application_id}/history", response_model=list[ApplicationStatusHistoryOut])
def application_status_history(application_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    application = db.get(Application, application_id)
    if not application:
        raise HTTPException(404, "Application not found")
    can_read = (
        user.role == "candidate" and application.candidate_id == user.id
    ) or (
        user.role == "recruiter" and application.job.recruiter_id == user.id
    )
    if not can_read:
        raise HTTPException(404, "Application not found")
    rows = list(db.scalars(
        select(ApplicationStatusHistory)
        .where(ApplicationStatusHistory.application_id == application_id)
        .order_by(ApplicationStatusHistory.changed_at.asc(), ApplicationStatusHistory.id.asc())
    ))
    return [_history_out(item, include_internal=user.role == "recruiter") for item in rows]


# =====================================================================
# AI JOB RECOMMENDATIONS
# =====================================================================
def _recommendable_jobs(user_id: int, position: str):
    return select(Job).where(
        Job.status == "open",
        func.lower(func.trim(Job.title)) == position.strip().lower(),
        ~Job.applications.any(Application.candidate_id == user_id),
    )


@api.get("/recommendations/positions")
def recommendation_positions(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    normalized_title = func.lower(func.trim(Job.title))
    positions = db.scalars(
        select(func.min(Job.title))
        .where(Job.status == "open", ~Job.applications.any(Application.candidate_id == user.id))
        .group_by(normalized_title)
        .order_by(normalized_title)
    )
    return {"positions": [title for title in positions if title and title.strip()]}


@api.get("/recommendations/jobs", response_model=list[JobOut])
def recommendation_jobs(
    position: str = Query(min_length=1, max_length=255),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    jobs = list(db.scalars(_recommendable_jobs(user.id, position).order_by(Job.created_at.desc(), Job.id.desc())))
    return [_job_out(job, db) for job in jobs]


@api.get("/recommendations")
def recommendation_selection_required(user: User = Depends(require_role("candidate"))):
    raise HTTPException(400, "Choose a CV and position, then start the AI analysis")


@api.post("/recommendations")
def recommend_jobs(
    data: RecommendationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    started = perf_counter()
    resume = _candidate_resume(db, user, data.resume_id)
    if not resume:
        raise HTTPException(404, "Resume not found")

    stmt = _recommendable_jobs(user.id, data.position)
    if data.mode == "single":
        stmt = stmt.where(Job.id == data.job_id)
        candidate_limit = 1
    else:
        candidate_limit = settings.AI_RECOMMENDATION_CANDIDATE_LIMIT
    jobs = list(db.scalars(stmt.order_by(Job.created_at.desc(), Job.id.desc()).limit(candidate_limit)))
    if data.mode == "single" and not jobs:
        raise HTTPException(404, "Open job not found for the selected position")

    skills = [x for x in resume.skills.split(", ") if x]
    scoring_context = ScoringContext.from_jobs(jobs)
    ranked = recommend_jobs_for_resume(
        resume.raw_text,
        skills,
        resume.experience_years,
        jobs,
        context=scoring_context,
        redact_terms=[user.full_name] if user.full_name else [],
        evidence_top=data.limit,
    )
    results = []
    for item in ranked[:data.limit]:
        job = item["job"]
        m = item["match"]
        results.append({
            "job": _job_out(job, db),
            "final_score": m["final_score"],
            "skill_score": m["skill_score"],
            "experience_score": m["experience_score"],
            "semantic_score": m["semantic_score"],
            "project_score": m["project_score"],
            "missing_skills": m["missing_skills"],
            "matched_skills": m["matched_skills"],
            "partial_skills": m["partial_skills"],
            "preferred_skills": m["preferred_skills"],
            "evidence": m.get("evidence", {}),
            "explanation": m["explanation"],
            "engine_version": m["engine_version"],
        })
    return {
        "items": results,
        "resume_insights": resume_tips(resume.raw_text),
        "analyzed_count": len(jobs),
        "candidate_limit": candidate_limit,
        "duration_ms": round((perf_counter() - started) * 1000, 2),
    }


# =====================================================================
# AI: PHÂN TÍCH CV VÀ PHẢN HỒI CỦA NHÀ TUYỂN DỤNG
# =====================================================================
@api.get("/resumes/me/insights", response_model=ResumeInsightsOut)
def resume_insights(db: Session = Depends(get_db), user: User = Depends(require_role("candidate"))):
    resume = _candidate_resume(db, user)
    if not resume:
        raise HTTPException(404, "Upload a CV first")
    return resume_tips(resume.raw_text)


AI_FEEDBACK_LABELS = ("agree", "too_high", "too_low")


def _feedback_out(item: AIFeedback) -> dict:
    return {"application_id": item.application_id, "label": item.label, "note": item.note,
            "score_snapshot": item.score_snapshot, "updated_at": item.updated_at}


@api.put("/applications/{application_id}/ai-feedback", response_model=AIFeedbackOut)
def save_ai_feedback(application_id: int, data: AIFeedbackIn, db: Session = Depends(get_db),
                     user: User = Depends(require_role("recruiter"))):
    application = db.get(Application, application_id)
    if not application or application.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    if data.label not in AI_FEEDBACK_LABELS:
        raise HTTPException(400, f"label must be one of: {', '.join(AI_FEEDBACK_LABELS)}")
    item = db.scalars(select(AIFeedback).where(
        AIFeedback.application_id == application_id, AIFeedback.recruiter_id == user.id)).first()
    if item:
        item.label, item.note, item.score_snapshot = data.label, data.note.strip()[:1000], application.final_score
    else:
        item = AIFeedback(application_id=application_id, recruiter_id=user.id, label=data.label,
                          note=data.note.strip()[:1000], score_snapshot=application.final_score)
        db.add(item)
    db.commit()
    db.refresh(item)
    return _feedback_out(item)


@api.get("/applications/{application_id}/ai-feedback", response_model=AIFeedbackOut | None)
def get_ai_feedback(application_id: int, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    application = db.get(Application, application_id)
    if not application or application.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    item = db.scalars(select(AIFeedback).where(
        AIFeedback.application_id == application_id, AIFeedback.recruiter_id == user.id)).first()
    return _feedback_out(item) if item else None


@api.get("/admin/ai/feedback-summary")
def ai_feedback_summary(db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    rows = list(db.scalars(select(AIFeedback)))
    counts = {label: sum(1 for r in rows if r.label == label) for label in AI_FEEDBACK_LABELS}
    total = len(rows)
    by_label = {
        label: round(sum(r.score_snapshot for r in rows if r.label == label) / counts[label], 2) if counts[label] else None
        for label in AI_FEEDBACK_LABELS
    }
    outcomes = {
        "positive": db.scalar(select(func.count(Application.id)).where(Application.status.in_(("interview", "offer", "hired")))) or 0,
        "negative": db.scalar(select(func.count(Application.id)).where(Application.status == "rejected")) or 0,
    }
    return {
        "total": total,
        "counts": counts,
        "agreement_rate": round(counts["agree"] / total, 3) if total else None,
        "average_score_by_label": by_label,
        "outcomes": outcomes,
        "enough_data_to_tune": total >= 30 and min(outcomes.values()) >= 8,
    }


# =====================================================================
# INTERVIEWS
# =====================================================================
def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _proposal_out(proposal: InterviewProposal) -> dict:
    application = proposal.application
    job = application.job if application else None
    return {
        "id": proposal.id,
        "application_id": proposal.application_id,
        "recruiter_id": proposal.recruiter_id,
        "status": proposal.status,
        "selected_option_id": proposal.selected_option_id,
        "duration_minutes": proposal.duration_minutes,
        "mode": proposal.mode,
        "location": proposal.location,
        "notes": proposal.notes,
        "job_title": job.title if job else None,
        "company_name": job.company.name if job and job.company else None,
        "candidate_name": application.candidate.full_name if application and application.candidate else None,
        "options": [{"id": option.id, "scheduled_at": option.scheduled_at} for option in proposal.options],
        "created_at": proposal.created_at,
        "confirmed_at": proposal.confirmed_at,
    }


@api.post("/interview-proposals", response_model=InterviewProposalOut)
def create_interview_proposal(
    data: InterviewProposalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("recruiter")),
):
    application = db.get(Application, data.application_id)
    if not application or application.job.recruiter_id != user.id:
        raise HTTPException(404, "Application not found")
    if application.status != "screening":
        raise HTTPException(409, "Application must be in screening before proposing interview times")

    proposed_times = [_utc_naive(value) for value in data.proposed_times]
    if len(set(proposed_times)) != 3:
        raise HTTPException(400, "Proposed interview times must be unique")
    if any(value <= datetime.utcnow() for value in proposed_times):
        raise HTTPException(400, "Proposed interview times must be in the future")
    if db.scalar(select(Interview).where(
        Interview.application_id == application.id,
        Interview.status != "cancelled",
    )):
        raise HTTPException(409, "Application already has an active interview")
    if db.scalar(select(InterviewProposal.id).where(
        InterviewProposal.application_id == application.id,
        InterviewProposal.status == "pending",
    )):
        raise HTTPException(409, "Application already has a pending interview proposal")

    proposal = InterviewProposal(
        application_id=application.id,
        recruiter_id=user.id,
        duration_minutes=data.duration_minutes,
        mode=data.mode,
        location=data.location.strip(),
        notes=data.notes.strip(),
    )
    db.add(proposal)
    db.flush()
    db.add_all([
        InterviewTimeOption(proposal_id=proposal.id, scheduled_at=value)
        for value in sorted(proposed_times)
    ])
    status_notification = _transition_application(
        application,
        "interview",
        user,
        db,
        "Đã gửi đề xuất thời gian phỏng vấn",
        data.candidate_message,
    )
    invitation_notification = Notification(
        user_id=application.candidate_id,
        application_id=application.id,
        type="interview_time_selection_requested",
        title="Vui lòng chọn thời gian phỏng vấn",
        message=f"Nhà tuyển dụng đã đề xuất 3 thời gian phỏng vấn cho vị trí {application.job.title}.",
    )
    db.add_all([status_notification, invitation_notification])
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Application already has a pending interview proposal") from exc
    db.refresh(proposal)
    return _proposal_out(proposal)


@api.get("/interview-proposals/me", response_model=list[InterviewProposalOut])
def my_interview_proposals(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    proposals = list(db.scalars(
        select(InterviewProposal)
        .join(Application)
        .where(Application.candidate_id == user.id, InterviewProposal.status == "pending")
        .order_by(InterviewProposal.created_at.desc(), InterviewProposal.id.desc())
    ))
    return [_proposal_out(proposal) for proposal in proposals]


@api.get("/recruiter/interview-proposals", response_model=list[InterviewProposalOut])
def recruiter_interview_proposals(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("recruiter")),
):
    proposals = list(db.scalars(
        select(InterviewProposal)
        .join(Application, InterviewProposal.application_id == Application.id)
        .join(Job, Application.job_id == Job.id)
        .where(Job.recruiter_id == user.id, InterviewProposal.status == "pending")
        .order_by(InterviewProposal.created_at.desc(), InterviewProposal.id.desc())
    ))
    return [_proposal_out(proposal) for proposal in proposals]


@api.get("/interview-proposals/{proposal_id}", response_model=InterviewProposalOut)
def interview_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    proposal = db.get(InterviewProposal, proposal_id)
    if not proposal or proposal.application.candidate_id != user.id:
        raise HTTPException(404, "Interview proposal not found")
    return _proposal_out(proposal)


@api.post("/interview-proposals/{proposal_id}/confirm", response_model=InterviewOut)
def confirm_interview_proposal(
    proposal_id: int,
    data: InterviewProposalConfirmIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("candidate")),
):
    proposal = db.get(InterviewProposal, proposal_id)
    if not proposal or proposal.application.candidate_id != user.id:
        raise HTTPException(404, "Interview proposal not found")
    if proposal.status != "pending":
        raise HTTPException(409, "Interview proposal is no longer pending")
    option = db.get(InterviewTimeOption, data.option_id)
    if not option or option.proposal_id != proposal.id:
        raise HTTPException(400, "Interview time option does not belong to this proposal")

    confirmed_at = datetime.utcnow()
    claimed = db.execute(
        update(InterviewProposal)
        .where(InterviewProposal.id == proposal.id, InterviewProposal.status == "pending")
        .values(status="confirmed", selected_option_id=option.id, confirmed_at=confirmed_at)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Interview proposal is no longer pending")

    interview = db.scalar(select(Interview).where(
        Interview.application_id == proposal.application_id,
        Interview.status != "cancelled",
    ))
    if interview:
        interview.scheduled_at = option.scheduled_at
        interview.duration_minutes = proposal.duration_minutes
        interview.mode = proposal.mode
        interview.location = proposal.location
        interview.notes = proposal.notes
        interview.status = "scheduled"
        interview.created_by = proposal.recruiter_id
    else:
        interview = Interview(
            application_id=proposal.application_id,
            scheduled_at=option.scheduled_at,
            duration_minutes=proposal.duration_minutes,
            mode=proposal.mode,
            location=proposal.location,
            notes=proposal.notes,
            status="scheduled",
            created_by=proposal.recruiter_id,
        )
        db.add(interview)
    db.add(Notification(
        user_id=proposal.recruiter_id,
        application_id=proposal.application_id,
        type="interview_time_confirmed",
        title="Ứng viên đã xác nhận lịch phỏng vấn",
        message=(
            f"{proposal.application.candidate.full_name} đã chọn thời gian phỏng vấn "
            f"{option.scheduled_at.strftime('%d/%m/%Y %H:%M')} cho vị trí {proposal.application.job.title}."
        ),
    ))
    db.commit()
    db.refresh(interview)
    return _interview_out(interview)


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
    active_interview = db.scalar(
        select(Interview).where(Interview.application_id == data.application_id, Interview.status != "cancelled")
    )
    if active_interview:
        raise HTTPException(409, "\u1ee8ng vi\u00ean n\u00e0y \u0111\u00e3 c\u00f3 l\u1ecbch ph\u1ecfng v\u1ea5n.")
    if db.scalar(select(InterviewProposal.id).where(
        InterviewProposal.application_id == data.application_id,
        InterviewProposal.status == "pending",
    )):
        raise HTTPException(409, "Ứng viên này đang có đề xuất thời gian chờ xác nhận.")
    interview = Interview(
        application_id=data.application_id, scheduled_at=data.scheduled_at,
        duration_minutes=data.duration_minutes, mode=data.mode, location=data.location,
        notes=data.notes, created_by=user.id,
    )
    status_notification = None
    if application.status != "interview":
        status_notification = _transition_application(application, "interview", user, db, "Tạo lịch phỏng vấn")
    db.add(interview)
    db.flush()
    mode = "Trực tuyến" if interview.mode == "online" else "Tại chỗ"
    interview_notification = Notification(
        user_id=application.candidate_id,
        application_id=application.id,
        type="interview_scheduled",
        title="Lịch phỏng vấn mới",
        message=(
            f"Phỏng vấn vị trí {application.job.title} vào "
            f"{interview.scheduled_at.strftime('%d/%m/%Y %H:%M')} ({mode})."
        ),
    )
    db.commit()
    _save_notifications(db, *([status_notification] if status_notification else []), interview_notification)
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
def update_interview_status(interview_id: int, data: InterviewStatusUpdateIn, db: Session = Depends(get_db), user: User = Depends(require_role("recruiter"))):
    interview = db.get(Interview, interview_id)
    if not interview or interview.created_by != user.id:
        raise HTTPException(404, "Interview not found")
    if data.status not in ("scheduled", "completed", "cancelled"):
        raise HTTPException(400, "Status must be scheduled, completed or cancelled")
    if interview.status == data.status:
        return {"message": "Interview updated"}
    interview.status = data.status
    titles = {
        "scheduled": "Lịch phỏng vấn đã được cập nhật",
        "completed": "Buổi phỏng vấn đã được đánh dấu hoàn thành",
        "cancelled": "Lịch phỏng vấn đã bị hủy",
    }
    notification = Notification(
        user_id=interview.application.candidate_id,
        application_id=interview.application_id,
        type="interview_updated",
        title=titles[data.status],
        message=f"{titles[data.status]} cho vị trí {interview.application.job.title}.",
    )
    db.commit()
    _save_notifications(db, notification)
    return {"message": "Interview updated"}


# =====================================================================
# NOTIFICATIONS
# =====================================================================
@api.get("/notifications", response_model=list[NotificationOut])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list(db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    ))


@api.get("/notifications/unread-count")
def notification_unread_count(db: Session = Depends(get_db), user: User = Depends(current_user)):
    count = db.scalar(
        select(func.count(Notification.id))
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
    ) or 0
    return {"count": count}


@api.patch("/notifications/read-all")
def read_all_notifications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return {"message": "All notifications marked as read"}


@api.patch("/notifications/{notification_id}/read", response_model=NotificationOut)
def read_notification(notification_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    notification = db.scalar(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    if not notification:
        raise HTTPException(404, "Notification not found")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


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
