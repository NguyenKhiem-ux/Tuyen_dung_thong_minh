"""
Seed the database with demo data: admin, recruiters, candidates, companies,
jobs, resumes, applications (AI-scored), interviews and evaluations.

Usage:
    cd backend
    python seed_demo.py
"""
from datetime import datetime, timedelta

from app.database import Base, engine, SessionLocal
from app import models
from app.security import hash_password
from app.ai_service import match_candidate
from app.config import settings

Base.metadata.create_all(bind=engine)
db = SessionLocal()


def get_or_create_user(email, full_name, role, password="Password123"):
    u = db.query(models.User).filter_by(email=email).first()
    if u:
        return u
    u = models.User(email=email, full_name=full_name, role=role, hashed_password=hash_password(password))
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def main():
    print("Seeding demo data...")

    admin = get_or_create_user(settings.ADMIN_EMAIL, "System Admin", "admin", settings.ADMIN_PASSWORD)

    recruiter1 = get_or_create_user("recruiter1@demo.ai", "Nguyen Van Tuyen", "recruiter")
    recruiter2 = get_or_create_user("recruiter2@demo.ai", "Tran Thi Mai", "recruiter")

    candidates = [
        get_or_create_user("candidate1@demo.ai", "Le Van An", "candidate"),
        get_or_create_user("candidate2@demo.ai", "Pham Thi Bich", "candidate"),
        get_or_create_user("candidate3@demo.ai", "Hoang Van Cuong", "candidate"),
    ]

    def get_or_create_company(name, recruiter, **kw):
        c = db.query(models.Company).filter_by(name=name, recruiter_id=recruiter.id).first()
        if c:
            return c
        c = models.Company(name=name, recruiter_id=recruiter.id, **kw)
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    company1 = get_or_create_company(
        "TechNova Solutions", recruiter1,
        description="Công ty phát triển phần mềm và AI cho doanh nghiệp.",
        website="https://technova.example.com", location="Hà Nội", industry="Software",
    )
    company2 = get_or_create_company(
        "DataBridge Analytics", recruiter2,
        description="Công ty tư vấn dữ liệu và phân tích kinh doanh.",
        website="https://databridge.example.com", location="TP. Hồ Chí Minh", industry="Data & Analytics",
    )

    def get_or_create_job(title, recruiter, company, **kw):
        j = db.query(models.Job).filter_by(title=title, recruiter_id=recruiter.id).first()
        if j:
            return j
        j = models.Job(title=title, recruiter_id=recruiter.id, company_id=company.id, **kw)
        db.add(j)
        db.commit()
        db.refresh(j)
        return j

    job1 = get_or_create_job(
        "Backend Developer (Python/FastAPI)", recruiter1, company1,
        description=(
            "Chúng tôi tìm kiếm Backend Developer có kinh nghiệm với Python, FastAPI, SQL và Docker "
            "để xây dựng các microservices cho nền tảng tuyển dụng AI. Ứng viên cần có tư duy hệ thống, "
            "kinh nghiệm làm việc với REST API và git."
        ),
        skills="python, fastapi, sql, docker, git, rest api",
        min_experience=1, location="Hà Nội", employment_type="Full-time", salary_range="15-25 triệu",
    )
    job2 = get_or_create_job(
        "Frontend Developer (React)", recruiter1, company1,
        description=(
            "Tuyển Frontend Developer thành thạo React, JavaScript/TypeScript, HTML/CSS để phát triển "
            "giao diện người dùng cho sản phẩm SaaS tuyển dụng thông minh."
        ),
        skills="react, javascript, typescript, html, css, git",
        min_experience=0.5, location="Remote", employment_type="Full-time", salary_range="12-20 triệu",
    )
    job3 = get_or_create_job(
        "Data Analyst", recruiter2, company2,
        description=(
            "Vị trí Data Analyst chịu trách nhiệm phân tích dữ liệu kinh doanh, xây dựng báo cáo Power BI, "
            "viết SQL truy vấn dữ liệu và hỗ trợ ra quyết định dựa trên số liệu."
        ),
        skills="sql, excel, power bi, python, pandas",
        min_experience=1, location="TP. Hồ Chí Minh", employment_type="Full-time", salary_range="14-22 triệu",
    )
    job4 = get_or_create_job(
        "Machine Learning Engineer", recruiter2, company2,
        description=(
            "Tìm kiếm Machine Learning Engineer có kinh nghiệm về pytorch/tensorflow, NLP và triển khai "
            "mô hình vào production, làm việc với dữ liệu lớn."
        ),
        skills="python, pytorch, tensorflow, nlp, machine learning, docker",
        min_experience=2, location="Remote", employment_type="Full-time", salary_range="25-40 triệu",
    )

    resume_samples = [
        (
            candidates[0],
            "resume_le_van_an.pdf",
            "Le Van An - Backend Developer\n"
            "3 years of experience with Python, FastAPI, Django, SQL, PostgreSQL, Docker, Git and REST API.\n"
            "Education: Bachelor of Computer Science, Hanoi University of Science and Technology.\n"
            "Project: Built a microservices job-matching platform on GitHub using FastAPI and Docker.\n",
        ),
        (
            candidates[1],
            "resume_pham_thi_bich.docx",
            "Pham Thi Bich - Frontend Developer\n"
            "2 years experience with React, JavaScript, TypeScript, HTML, CSS, Git.\n"
            "Education: Bachelor of Information Technology, University of Economics.\n"
            "Project: Portfolio website and an e-commerce dashboard built with React.\n",
        ),
        (
            candidates[2],
            "resume_hoang_van_cuong.pdf",
            "Hoang Van Cuong - Data & ML\n"
            "4 years of experience in Python, pandas, numpy, SQL, machine learning, pytorch, NLP.\n"
            "Education: Master of Data Science, Vietnam National University.\n"
            "Project: Implemented an NLP resume-matching system and a churn-prediction project on GitHub.\n",
        ),
    ]

    from app.ai_service import extract_skills, extract_experience, extract_education, extract_projects

    resumes = {}
    for candidate, filename, text in resume_samples:
        existing = db.query(models.Resume).filter_by(candidate_id=candidate.id).first()
        if existing:
            resumes[candidate.id] = existing
            continue
        skills = extract_skills(text)
        exp = extract_experience(text)
        edu = extract_education(text)
        proj = extract_projects(text)
        r = models.Resume(
            candidate_id=candidate.id, filename=filename, raw_text=text,
            skills=", ".join(skills), experience_years=exp,
            education="\n".join(edu), projects="\n".join(proj),
            summary=f"CV phân tích tự động: {len(skills)} kỹ năng, {exp:g} năm kinh nghiệm.",
        )
        db.add(r)
        db.commit()
        db.refresh(r)
        resumes[candidate.id] = r

    def get_or_create_application(candidate, job, resume):
        existing = db.query(models.Application).filter_by(candidate_id=candidate.id, job_id=job.id).first()
        if existing:
            return existing
        skills = [x for x in resume.skills.split(", ") if x]
        m = match_candidate(job.description, job.skills, job.min_experience, resume.raw_text, skills, resume.experience_years)
        a = models.Application(
            candidate_id=candidate.id, job_id=job.id, resume_id=resume.id,
            skill_score=m["skill_score"], experience_score=m["experience_score"],
            semantic_score=m["semantic_score"], project_score=m["project_score"], final_score=m["final_score"],
            missing_skills=", ".join(m["missing_skills"]), explanation=m["explanation"],
        )
        db.add(a)
        db.commit()
        db.refresh(a)
        return a

    app1 = get_or_create_application(candidates[0], job1, resumes[candidates[0].id])
    app1.status = "interview"
    app2 = get_or_create_application(candidates[1], job2, resumes[candidates[1].id])
    app2.status = "screening"
    app3 = get_or_create_application(candidates[2], job4, resumes[candidates[2].id])
    app3.status = "offer"
    get_or_create_application(candidates[2], job3, resumes[candidates[2].id])
    db.commit()

    if not db.query(models.Interview).filter_by(application_id=app1.id).first():
        db.add(models.Interview(
            application_id=app1.id,
            scheduled_at=datetime.utcnow() + timedelta(days=3),
            duration_minutes=45, mode="online", location="Google Meet",
            notes="Vòng phỏng vấn kỹ thuật với team Backend.", created_by=recruiter1.id,
        ))

    if not db.query(models.Evaluation).filter_by(application_id=app3.id).first():
        db.add(models.Evaluation(
            application_id=app3.id, recruiter_id=recruiter2.id, rating=5,
            strengths="Kinh nghiệm ML vững, có dự án NLP thực tế.",
            concerns="Chưa có kinh nghiệm triển khai hệ thống quy mô lớn.",
            comment="Ứng viên tiềm năng, đề xuất tiến tới vòng offer.",
        ))
    db.commit()

    print("Done. Demo accounts (password 'Password123' unless noted):")
    print(f"  Admin:     {settings.ADMIN_EMAIL} / {settings.ADMIN_PASSWORD}")
    print("  Recruiter: recruiter1@demo.ai / Password123")
    print("  Recruiter: recruiter2@demo.ai / Password123")
    print("  Candidate: candidate1@demo.ai / Password123")
    print("  Candidate: candidate2@demo.ai / Password123")
    print("  Candidate: candidate3@demo.ai / Password123")


if __name__ == "__main__":
    main()
    db.close()
