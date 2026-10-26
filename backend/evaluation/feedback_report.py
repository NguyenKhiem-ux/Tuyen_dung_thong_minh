"""Báo cáo phản hồi của nhà tuyển dụng về điểm AI.

    python evaluation/feedback_report.py

Nhà tuyển dụng đánh dấu mỗi đơn: "agree" (điểm hợp lý), "too_high" (quá cao), "too_low" (quá thấp).
Báo cáo cho biết tỉ lệ đồng ý, xu hướng chấm lệch và độ tin cậy theo từng khoảng điểm.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BINS = [(0, 40), (40, 60), (60, 80), (80, 100.01)]
MIN_PER_BIN = 5


def summarize(rows: list[tuple[str, float]]) -> dict:
    """rows: [(nhãn, điểm AI lúc ghi nhận)]."""
    total = len(rows)
    counts = {k: sum(1 for l, _ in rows if l == k) for k in ("agree", "too_high", "too_low")}
    bins = []
    for lo, hi in BINS:
        inside = [l for l, s in rows if lo <= s < hi]
        bins.append({
            "range": f"{lo}-{min(hi, 100):g}", "n": len(inside),
            "agree_rate": round(sum(1 for l in inside if l == "agree") / len(inside), 3) if len(inside) >= MIN_PER_BIN else None,
        })
    drift = None
    if counts["too_high"] + counts["too_low"]:
        drift = "chấm quá cao" if counts["too_high"] > counts["too_low"] else (
            "chấm quá thấp" if counts["too_low"] > counts["too_high"] else "cân bằng")
    return {
        "total": total, "counts": counts,
        "agreement_rate": round(counts["agree"] / total, 3) if total else None,
        "drift": drift, "bins": bins,
        "reliable": total >= 30,
    }


def main() -> None:
    from sqlalchemy import select
    from app.database import Base, SessionLocal, engine
    from app.models import AIFeedback

    Base.metadata.create_all(engine)  # CSDL cũ chưa có bảng ai_feedback cho tới khi backend khởi động lại
    with SessionLocal() as db:
        rows = [(f.label, f.score_snapshot) for f in db.scalars(select(AIFeedback))]
    result = summarize(rows)
    print(f"Số phản hồi: {result['total']}")
    if not result["total"]:
        print("Chưa có phản hồi nào. Nhà tuyển dụng đánh giá điểm AI trong cửa sổ hồ sơ ứng viên.")
        return
    print(f"Đồng ý: {result['counts']['agree']}  quá cao: {result['counts']['too_high']}  quá thấp: {result['counts']['too_low']}")
    print(f"Tỉ lệ đồng ý: {result['agreement_rate']:.1%}; xu hướng lệch: {result['drift'] or 'không có'}")
    for b in result["bins"]:
        rate = "chưa đủ mẫu" if b["agree_rate"] is None else f"{b['agree_rate']:.1%}"
        print(f"  điểm {b['range']:>7}: n={b['n']:<4} đồng ý: {rate}")
    if not result["reliable"]:
        print("Cảnh báo: dưới 30 phản hồi, chưa đủ để rút ra kết luận.")


if __name__ == "__main__":
    main()
