"""So sánh engine v1 (legacy) và engine hiện tại trên dữ liệu thật trong CSDL.

    python evaluation/shadow_compare.py

Với mỗi CV mới nhất của từng ứng viên, chấm tất cả tin đang mở bằng cả hai engine, rồi báo cáo
mức tương quan thứ hạng, tỉ lệ cùng chọn tin tốt nhất và các thay đổi lớn nhất. Dùng để kiểm tra
trước khi đưa engine mới vào chạy thật: nơi hai engine bất đồng là nơi cần người xem lại.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))


def _ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None
    rx, ry = _ranks(xs), _ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    var = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return None if var == 0 else round(cov / var, 3)


def main() -> None:
    from sqlalchemy import select
    import legacy_ai_service as old
    from app import ai_service as new
    from app.database import SessionLocal
    from app.models import Job, Resume, User

    with SessionLocal() as db:
        jobs = list(db.scalars(select(Job).where(Job.status == "open")))
        users = list(db.scalars(select(User).where(User.role == "candidate")))
        pairs = []
        for user in users:
            resume = db.scalars(select(Resume).where(Resume.candidate_id == user.id).order_by(Resume.created_at.desc())).first()
            if resume and resume.raw_text.strip():
                pairs.append((user, resume))
    if len(jobs) < 3 or not pairs:
        print("Cần ít nhất 3 tin đang mở và 1 CV để so sánh.")
        return
    ctx = new.ScoringContext.from_jobs(jobs)
    agree_top, rhos = 0, []
    for user, resume in pairs:
        o_skills = old.extract_skills(resume.raw_text)
        o_exp = old.extract_experience(resume.raw_text)
        old_scores = [old.match_candidate(j.description, j.skills, j.min_experience, resume.raw_text, o_skills, o_exp)["final_score"] for j in jobs]
        new_scores = [new.match_candidate(j.description, j.skills, j.min_experience, resume.raw_text, [], 0, job_title=j.title,
                                          context=ctx, redact_terms=[user.full_name], with_evidence=False)["final_score"] for j in jobs]
        rho = spearman(old_scores, new_scores)
        top_old, top_new = jobs[old_scores.index(max(old_scores))], jobs[new_scores.index(max(new_scores))]
        agree_top += top_old.id == top_new.id
        rhos.append(rho)
        flag = "" if top_old.id == top_new.id else "   <-- khác tin tốt nhất"
        print(f"{user.full_name:<24} tương quan thứ hạng={rho}  v1: {top_old.title[:28]:<28} v3: {top_new.title[:28]}{flag}")
    valid = [r for r in rhos if r is not None]
    print(f"\nCùng chọn tin tốt nhất: {agree_top}/{len(pairs)}; tương quan thứ hạng trung bình: "
          f"{sum(valid) / len(valid):.3f}" if valid else "")


if __name__ == "__main__":
    main()
