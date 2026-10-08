from __future__ import annotations

import csv
import os
import sqlite3
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "cv_jd_labels.csv"
FIELDS = [
    "pair_id",
    "resume_id",
    "candidate_id",
    "job_id",
    "job_title",
    "job_skills",
    "min_experience",
    "ai_score",
    "human_relevance",
    "notes",
]


def split_skills(value: str | None) -> list[str]:
    return [item.strip().lower() for item in (value or "").split(",") if item.strip()]


def load_matcher():
    sys.path.insert(0, str(BACKEND_DIR))
    try:
        from app.ai_service import match_candidate
    except Exception as exc:
        return None, f"ai_score skipped: cannot import app.ai_service.match_candidate ({exc})"
    return match_candidate, "ai_score computed with app.ai_service.match_candidate"


def load_pairs_with_orm():
    sys.path.insert(0, str(BACKEND_DIR))
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import Job, Resume

    with SessionLocal() as db:
        resumes = list(db.scalars(select(Resume).order_by(Resume.id)))
        jobs = list(db.scalars(select(Job).order_by(Job.id)))

    return resumes, jobs


def sqlite_path() -> Path:
    url = os.environ.get("DATABASE_URL", "")
    if url.startswith("sqlite:///"):
        raw_path = url.removeprefix("sqlite:///")
        path = Path(raw_path)
        return path if path.is_absolute() else BACKEND_DIR / path
    return BACKEND_DIR / "smart_recruitment.db"


def load_pairs_with_sqlite():
    path = sqlite_path()
    if not path.exists():
        raise FileNotFoundError(f"Database not found: {path}")

    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        resumes = con.execute(
            "select id, candidate_id, raw_text, skills, experience_years from resumes order by id"
        ).fetchall()
        jobs = con.execute(
            "select id, title, description, skills, min_experience from jobs order by id"
        ).fetchall()
    finally:
        con.close()

    return resumes, jobs


def get_value(item, key):
    return item[key] if isinstance(item, sqlite3.Row) else getattr(item, key)


def build_rows(resumes, jobs, match_candidate):
    rows = []
    score_errors = 0
    for resume in resumes:
        resume_id = get_value(resume, "id")
        resume_text = get_value(resume, "raw_text") or ""
        resume_skills = split_skills(get_value(resume, "skills"))
        resume_exp = get_value(resume, "experience_years") or 0

        for job in jobs:
            job_id = get_value(job, "id")
            job_description = get_value(job, "description") or ""
            job_skills = get_value(job, "skills") or ""
            min_experience = get_value(job, "min_experience") or 0
            ai_score = ""

            if match_candidate:
                try:
                    result = match_candidate(
                        job_description,
                        job_skills,
                        min_experience,
                        resume_text,
                        resume_skills,
                        resume_exp,
                    )
                    ai_score = result.get("final_score", "")
                except Exception:
                    score_errors += 1

            rows.append(
                {
                    "pair_id": f"resume_{resume_id}_job_{job_id}",
                    "resume_id": resume_id,
                    "candidate_id": get_value(resume, "candidate_id"),
                    "job_id": job_id,
                    "job_title": get_value(job, "title"),
                    "job_skills": job_skills,
                    "min_experience": min_experience,
                    "ai_score": ai_score,
                    "human_relevance": "",
                    "notes": "",
                }
            )

    return rows, score_errors


def write_csv(rows):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main():
    try:
        resumes, jobs = load_pairs_with_orm()
        load_source = "database loaded with app.database.SessionLocal"
    except Exception as exc:
        resumes, jobs = load_pairs_with_sqlite()
        load_source = f"database loaded with sqlite fallback ({exc})"

    match_candidate, score_status = load_matcher()
    rows, score_errors = build_rows(resumes, jobs, match_candidate)
    write_csv(rows)

    print(load_source)
    print(score_status)
    if score_errors:
        print(f"ai_score blank for {score_errors} pair(s) because matching failed")
    print(f"resumes: {len(resumes)}")
    print(f"jobs: {len(jobs)}")
    print(f"pairs: {len(rows)}")
    print(f"csv: {OUTPUT_PATH}")
    print("first_5_rows:")
    for row in rows[:5]:
        print(row)


if __name__ == "__main__":
    main()
