"""Đề xuất trọng số (kỹ năng, kinh nghiệm, ngữ nghĩa, dự án) từ kết quả tuyển dụng thật.

    python evaluation/tune_weights.py

Nhãn dương: đơn từng đạt vòng Phỏng vấn trở lên. Nhãn âm: đơn bị loại mà chưa từng đạt Phỏng vấn.
Đơn đang xử lý bị bỏ qua. Công cụ KHÔNG tự áp dụng; nếu hợp lý, đặt AI_WEIGHTS trong backend/.env.
Từ chối chạy khi dữ liệu quá ít, vì khi đó trọng số học được chỉ là nhiễu.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FEATURES = ("skill_score", "experience_score", "semantic_score", "project_score")
KEYS = ("skill", "experience", "semantic", "project")
MIN_SAMPLES, MIN_PER_CLASS = 30, 8


def suggest_weights(samples: list[dict], bootstrap: int = 200, seed: int = 0) -> dict:
    """samples: [{skill_score,..., project_score, label (0/1)}]."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import cross_val_predict

    labels = np.array([s["label"] for s in samples], dtype=int)
    positives, negatives = int(labels.sum()), int(len(labels) - labels.sum())
    if len(samples) < MIN_SAMPLES or min(positives, negatives) < MIN_PER_CLASS:
        return {"ok": False, "n": len(samples), "positives": positives, "negatives": negatives,
                "reason": f"Cần ít nhất {MIN_SAMPLES} đơn và mỗi nhóm {MIN_PER_CLASS} đơn; hiện có {positives} dương, {negatives} âm."}
    X = np.array([[s[f] for f in FEATURES] for s in samples], dtype=float) / 100.0

    def fit_weights(Xs, ys):
        coef = LogisticRegression(C=1.0, class_weight="balanced").fit(Xs, ys).coef_[0]
        coef = np.clip(coef, 0, None)
        return coef / coef.sum() if coef.sum() > 0 else np.full(4, 0.25)

    weights = fit_weights(X, labels)
    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(bootstrap):
        idx = rng.integers(0, len(labels), len(labels))
        if labels[idx].sum() in (0, len(idx)):
            continue
        boots.append(fit_weights(X[idx], labels[idx]))
    boots = np.array(boots)
    low, high = np.percentile(boots, [5, 95], axis=0)

    from app.ai_service import DEFAULT_WEIGHTS
    current = X @ np.array([DEFAULT_WEIGHTS[k] for k in KEYS])
    proba = cross_val_predict(LogisticRegression(C=1.0, class_weight="balanced"), X, labels, cv=3, method="decision_function")
    return {
        "ok": True, "n": len(samples), "positives": positives, "negatives": negatives,
        "weights": dict(zip(KEYS, (round(float(w), 3) for w in weights))),
        "interval_90": {k: (round(float(l), 3), round(float(h), 3)) for k, l, h in zip(KEYS, low, high)},
        "unstable": [k for k, l, h in zip(KEYS, low, high) if h - l > 0.30],
        "auc_current": round(float(roc_auc_score(labels, current)), 3),
        "auc_suggested_cv": round(float(roc_auc_score(labels, proba)), 3),
        "env": "AI_WEIGHTS=" + ",".join(f"{w:.2f}" for w in weights),
    }


def load_samples() -> list[dict]:
    from sqlalchemy import select
    from app.database import SessionLocal
    from app.models import Application, ApplicationStatusHistory

    reached = {"interview", "offer", "hired"}
    samples = []
    with SessionLocal() as db:
        for app in db.scalars(select(Application)):
            history = {h.new_status for h in db.scalars(select(ApplicationStatusHistory).where(
                ApplicationStatusHistory.application_id == app.id))}
            if app.status in reached or history & reached:
                label = 1
            elif app.status == "rejected":
                label = 0
            else:
                continue
            samples.append({f: getattr(app, f) for f in FEATURES} | {"label": label})
    return samples


def main() -> None:
    result = suggest_weights(load_samples())
    if not result["ok"]:
        print("Chưa thể đề xuất trọng số.\n" + result["reason"])
        return
    print(f"Mẫu: {result['n']} ({result['positives']} dương / {result['negatives']} âm)")
    for k in KEYS:
        lo, hi = result["interval_90"][k]
        print(f"  {k:<10} {result['weights'][k]:.3f}  (khoảng 90%: {lo:.2f} - {hi:.2f})")
    print(f"AUC hiện tại {result['auc_current']}  |  AUC đề xuất (kiểm tra chéo) {result['auc_suggested_cv']}")
    if result["unstable"]:
        print("Không ổn định (khoảng quá rộng): " + ", ".join(result["unstable"]))
    print(f"Nếu muốn áp dụng, thêm vào backend/.env:  {result['env']}")


if __name__ == "__main__":
    main()
