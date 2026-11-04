"""Kiểm tra công bằng bằng phản thực tế: thêm/đổi thông tin nhạy cảm vào CV thật rồi so điểm.

    python evaluation/fairness_audit.py

Với mỗi CV trong CSDL và mỗi tin đang mở, chấm điểm CV gốc và các biến thể (thêm giới tính, ngày sinh,
tình trạng hôn nhân, địa chỉ ở thành phố khác, đổi tên). Điểm phải GIỐNG HỆT; độ lệch lớn nhất khác 0
nghĩa là còn thông tin nhạy cảm lọt vào điểm. Lưu ý phạm vi: chỉ kiểm tra các trường có nhãn rõ ràng.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

VARIANTS = {
    "thêm giới tính/ngày sinh/hôn nhân": "Gender: Female\nDate of birth: 12/03/1995\nMarital status: Married\n",
    "thêm bản tiếng Việt": "Giới tính: Nữ\nNgày sinh: 12/03/1995\nTình trạng hôn nhân: Đã kết hôn\nQuốc tịch: Việt Nam\n",
    "địa chỉ Hà Nội": "Địa chỉ: Hà Nội\n",
    "địa chỉ TP. Hồ Chí Minh": "Địa chỉ: TP. Hồ Chí Minh\n",
    "thông tin liên hệ khác": "Email: other.person@example.com\nPhone: +84 987 654 321\n",
}
KEYS = ("skill_score", "experience_score", "semantic_score", "project_score", "final_score")


def max_deviation(base: dict, variant: dict) -> float:
    return max(abs(base[k] - variant[k]) for k in KEYS)


def main() -> None:
    from sqlalchemy import select
    from app import ai_service as ai
    from app.database import SessionLocal
    from app.models import Job, Resume, User

    with SessionLocal() as db:
        jobs = list(db.scalars(select(Job).where(Job.status == "open")))
        rows = [(u, db.scalars(select(Resume).where(Resume.candidate_id == u.id).order_by(Resume.created_at.desc())).first())
                for u in db.scalars(select(User).where(User.role == "candidate"))]
    rows = [(u, r) for u, r in rows if r and r.raw_text.strip()]
    if not jobs or not rows:
        print("Cần ít nhất 1 tin đang mở và 1 CV.")
        return
    ctx = ai.ScoringContext.from_jobs(jobs)
    worst = {name: 0.0 for name in VARIANTS}
    worst["đổi tên ứng viên"] = 0.0
    for user, resume in rows:
        for job in jobs:
            def score(text, name):
                return ai.match_candidate(job.description, job.skills, job.min_experience, text, [], 0, job_title=job.title,
                                          context=ctx, redact_terms=[name], with_evidence=False)
            base = score(resume.raw_text, user.full_name)
            for name, block in VARIANTS.items():
                worst[name] = max(worst[name], max_deviation(base, score(block + resume.raw_text, user.full_name)))
            renamed = resume.raw_text.replace(user.full_name, "Nguyen Thi Hoa")
            worst["đổi tên ứng viên"] = max(worst["đổi tên ứng viên"], max_deviation(base, score(renamed, "Nguyen Thi Hoa")))
    print(f"Đã kiểm tra {len(rows)} CV x {len(jobs)} tin.")
    for name, deviation in worst.items():
        print(f"  {name:<38} độ lệch điểm lớn nhất: {deviation:.2f} {'OK' if deviation == 0 else '<-- CÓ RÒ RỈ'}")


if __name__ == "__main__":
    main()
