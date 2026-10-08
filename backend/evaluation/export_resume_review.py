from __future__ import annotations

import csv
import os
import sqlite3
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "resume_review.csv"
FIELDS = [
    "resume_id",
    "candidate_id",
    "extracted_text",
    "extracted_skills",
    "experience",
    "education",
    "projects",
    "text_length",
    "parse_status",
]


def load_resumes_with_orm():
    sys.path.insert(0, str(BACKEND_DIR))
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import Resume

    with SessionLocal() as db:
        return list(db.scalars(select(Resume).order_by(Resume.id)))


def sqlite_path() -> Path:
    url = os.environ.get("DATABASE_URL", "")
    if url.startswith("sqlite:///"):
        raw_path = url.removeprefix("sqlite:///")
        path = Path(raw_path)
        return path if path.is_absolute() else BACKEND_DIR / path
    return BACKEND_DIR / "smart_recruitment.db"


def load_resumes_with_sqlite():
    path = sqlite_path()
    if not path.exists():
        raise FileNotFoundError(f"Database not found: {path}")

    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        return con.execute(
            """
            select id, candidate_id, raw_text, skills, experience_years, education, projects
            from resumes
            order by id
            """
        ).fetchall()
    finally:
        con.close()


def value(row, key):
    return row[key] if isinstance(row, sqlite3.Row) else getattr(row, key)


def parse_status(text: str) -> str:
    stripped = (text or "").strip()
    if not stripped:
        return "EMPTY"

    words = [word for word in stripped.split() if any(char.isalnum() for char in word)]
    alpha_chars = sum(char.isalpha() for char in stripped)
    if len(stripped) < 80 or len(words) < 8 or alpha_chars < 40:
        return "SUSPICIOUS"
    return "OK"


def build_rows(resumes):
    rows = []
    for resume in resumes:
        text = value(resume, "raw_text") or ""
        rows.append(
            {
                "resume_id": value(resume, "id"),
                "candidate_id": value(resume, "candidate_id"),
                "extracted_text": text,
                "extracted_skills": value(resume, "skills") or "",
                "experience": value(resume, "experience_years") or 0,
                "education": value(resume, "education") or "",
                "projects": value(resume, "projects") or "",
                "text_length": len(text.strip()),
                "parse_status": parse_status(text),
            }
        )
    return rows


def write_csv(rows):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main():
    try:
        resumes = load_resumes_with_orm()
        source = "database loaded with app.database.SessionLocal"
    except Exception as exc:
        resumes = load_resumes_with_sqlite()
        source = f"database loaded with sqlite fallback ({exc})"

    rows = build_rows(resumes)
    write_csv(rows)

    ok = [str(row["resume_id"]) for row in rows if row["parse_status"] == "OK"]
    flagged = [str(row["resume_id"]) for row in rows if row["parse_status"] != "OK"]

    print(source)
    print(f"total resumes: {len(rows)}")
    print(f"OK resumes: {', '.join(ok) if ok else 'none'}")
    print(f"EMPTY/SUSPICIOUS resumes: {', '.join(flagged) if flagged else 'none'}")
    print("text_length by resume:")
    for row in rows:
        print(f"- resume {row['resume_id']}: {row['text_length']} ({row['parse_status']})")
    print(f"csv: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
