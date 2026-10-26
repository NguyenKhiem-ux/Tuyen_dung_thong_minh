"""Phân tích lại các CV đã lưu bằng engine AI hiện tại.

CV tải lên trước bản nâng cấp có thể còn kỹ năng/kinh nghiệm sai do engine v1
(ví dụ "excellent" bị ghi thành kỹ năng excel). Điểm của các đơn ứng tuyển cũ KHÔNG bị
thay đổi; script chỉ cập nhật thông tin phân tích của chính CV.

    python reanalyze_resumes.py            # xem trước, không ghi gì
    python reanalyze_resumes.py --apply    # ghi vào cơ sở dữ liệu
"""
import sys

from sqlalchemy import select

from app.ai_service import extract_education, extract_experience, extract_projects, extract_skills
from app.database import SessionLocal
from app.models import Resume


def main(apply: bool) -> None:
    changed = 0
    with SessionLocal() as db:
        for resume in db.scalars(select(Resume)):
            if not (resume.raw_text or "").strip():
                continue
            skills = extract_skills(resume.raw_text)
            experience = extract_experience(resume.raw_text)
            education = "\n".join(extract_education(resume.raw_text))
            projects = "\n".join(extract_projects(resume.raw_text))
            old_skills = [s for s in (resume.skills or "").split(", ") if s]
            if (set(old_skills) == set(skills) and abs((resume.experience_years or 0) - experience) < 0.05
                    and (resume.education or "") == education and (resume.projects or "") == projects):
                continue
            changed += 1
            print(f"CV #{resume.id} ({resume.filename})")
            print(f"  kỹ năng : -{sorted(set(old_skills) - set(skills))} +{sorted(set(skills) - set(old_skills))}")
            print(f"  kinh nghiệm: {resume.experience_years:g} -> {experience:g} năm")
            if apply:
                resume.skills = ", ".join(skills)
                resume.experience_years = experience
                resume.education = education
                resume.projects = projects
                resume.summary = f"CV phân tích tự động: {len(skills)} kỹ năng, {experience:g} năm kinh nghiệm."
        if apply:
            db.commit()
    mode = "đã cập nhật" if apply else "sẽ cập nhật (chạy lại với --apply để ghi)"
    print(f"{changed} CV {mode}.")


if __name__ == "__main__":
    main("--apply" in sys.argv)
