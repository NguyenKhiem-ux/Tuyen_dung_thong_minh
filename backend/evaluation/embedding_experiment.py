from __future__ import annotations

import csv
import re
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from evaluate import (
    CSV_PATH,
    VALIDITY_PATH,
    average,
    fmt,
    ndcg_at,
    parse_rows,
    parse_validity,
    precision_at,
    recall_at,
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
SCORES_PATH = Path(__file__).resolve().parent / "results" / "embedding_rule_scores.csv"
REPORT_PATH = Path(__file__).resolve().parent / "results" / "embedding_rule_v1.txt"
BASELINE_PATH = Path(__file__).resolve().parent / "results" / "baseline_tfidf_rule.txt"
EXPERIMENT_NAME = "Embedding + Rule-based v1"


def split_skills(value: str | None) -> list[str]:
    return [item.strip().lower() for item in (value or "").split(",") if item.strip()]


def load_match_candidate():
    sys.path.insert(0, str(BACKEND_DIR))
    from app.ai_service import match_candidate

    return match_candidate


def load_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def sqlite_path() -> Path:
    return BACKEND_DIR / "smart_recruitment.db"


def load_data():
    path = sqlite_path()
    if not path.exists():
        raise FileNotFoundError(f"Database not found: {path}")

    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        resumes = {
            str(row["id"]): row
            for row in con.execute(
                "select id, raw_text, skills, experience_years from resumes order by id"
            )
        }
        jobs = {
            str(row["id"]): row
            for row in con.execute(
                """
                select id, title, description, skills, min_experience, employment_type
                from jobs
                order by id
                """
            )
        }
    finally:
        con.close()
    return resumes, jobs


def job_text(job) -> str:
    return "\n".join(
        [
            job["title"] or "",
            job["description"] or "",
            f"Skills: {job['skills'] or ''}",
            f"Minimum experience: {job['min_experience'] or 0:g} years",
            f"Employment type: {job['employment_type'] or ''}",
        ]
    )


def cosine_to_score(value: float) -> float:
    return round(max(0.0, min(1.0, value)) * 100, 2)


def embed_texts(model, texts: list[str]):
    return model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)


def dot(a, b) -> float:
    return float(sum(float(x) * float(y) for x, y in zip(a, b)))


def score_pairs(labeled, resumes, jobs, model, match_candidate):
    resume_ids = sorted({row["resume_id"] for row in labeled}, key=int)
    job_ids = sorted({row["job_id"] for row in labeled}, key=int)

    resume_embeddings = dict(zip(
        resume_ids,
        embed_texts(model, [resumes[resume_id]["raw_text"] or "" for resume_id in resume_ids]),
    ))
    job_embeddings = dict(zip(
        job_ids,
        embed_texts(model, [job_text(jobs[job_id]) for job_id in job_ids]),
    ))

    rows = []
    for label in labeled:
        resume = resumes[label["resume_id"]]
        job = jobs[label["job_id"]]
        rule = match_candidate(
            job["description"] or "",
            job["skills"] or "",
            float(job["min_experience"] or 0),
            resume["raw_text"] or "",
            split_skills(resume["skills"]),
            float(resume["experience_years"] or 0),
        )
        embedding_score = cosine_to_score(dot(resume_embeddings[label["resume_id"]], job_embeddings[label["job_id"]]))
        final_score = round(
            0.40 * rule["skill_score"]
            + 0.25 * rule["experience_score"]
            + 0.20 * embedding_score
            + 0.15 * rule["project_score"],
            2,
        )
        rows.append(
            {
                "resume_id": label["resume_id"],
                "job_id": label["job_id"],
                "job_title": job["title"],
                "skill_score": rule["skill_score"],
                "experience_score": rule["experience_score"],
                "embedding_score": embedding_score,
                "project_score": rule["project_score"],
                "final_score": final_score,
                "human_relevance": label["human_relevance"],
            }
        )
    return rows


def metric_rows(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["resume_id"]].append(row)

    per_resume = []
    for resume_id, items in sorted(groups.items(), key=lambda pair: int(pair[0])):
        ranked = sorted(items, key=lambda item: item["final_score"], reverse=True)
        per_resume.append(
            {
                "resume_id": resume_id,
                "ranked": ranked,
                "p1": precision_at(ranked, 1),
                "p3": precision_at(ranked, 3),
                "r1": recall_at(ranked, 1),
                "r3": recall_at(ranked, 3),
                "n1": ndcg_at(ranked, 1),
                "n3": ndcg_at(ranked, 3),
            }
        )
    metrics = {
        "Precision@1": average(item["p1"] for item in per_resume),
        "Precision@3": average(item["p3"] for item in per_resume),
        "Recall@1": average(item["r1"] for item in per_resume),
        "Recall@3": average(item["r3"] for item in per_resume),
        "NDCG@1": average(item["n1"] for item in per_resume),
        "NDCG@3": average(item["n3"] for item in per_resume),
    }
    return per_resume, metrics


def write_scores(rows):
    SCORES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SCORES_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "resume_id",
                "job_id",
                "job_title",
                "skill_score",
                "experience_score",
                "embedding_score",
                "project_score",
                "final_score",
                "human_relevance",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def parse_baseline_metrics():
    if not BASELINE_PATH.exists():
        return {}
    text = BASELINE_PATH.read_text(encoding="utf-8")
    metrics = {}
    for name in ("Precision@1", "Precision@3", "Recall@1", "Recall@3", "NDCG@1", "NDCG@3"):
        match = re.search(rf"^{re.escape(name)}:\s+([0-9.]+|N/A)", text, flags=re.MULTILINE)
        if match:
            metrics[name] = match.group(1)
    return metrics


def rank_text(items):
    return ", ".join(
        f"{item['job_id']}:{item['job_title']} (score {item['final_score']:g}, HR {item['human_relevance']})"
        for item in items
    )


def render_report(lines):
    text = "\n".join(lines) + "\n"
    print(text, end="")
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(text, encoding="utf-8")


def main():
    total_start = time.perf_counter()
    validity, errors = parse_validity(VALIDITY_PATH)
    if not errors:
        labeled, _, _, errors = parse_rows(CSV_PATH, validity)
    if errors:
        print("Data errors")
        for error in errors:
            print(f"- {error}")
        return 1

    valid_resumes = sorted([resume_id for resume_id, item in validity.items() if item["valid"]], key=int)
    resumes, jobs = load_data()

    try:
        match_candidate = load_match_candidate()
    except Exception as exc:
        print(f"Missing rule dependency: cannot import app.ai_service.match_candidate ({exc})")
        return 1

    try:
        load_start = time.perf_counter()
        model = load_model()
        model_load_time = time.perf_counter() - load_start
    except Exception as exc:
        print(f"Missing embedding dependency/model: {exc}")
        print("Install backend requirements and ensure the model can be downloaded or is cached locally.")
        return 1

    scoring_start = time.perf_counter()
    rows = score_pairs(labeled, resumes, jobs, model, match_candidate)
    scoring_time = time.perf_counter() - scoring_start
    write_scores(rows)
    per_resume, metrics = metric_rows(rows)
    total_time = time.perf_counter() - total_start
    avg_pair_time = scoring_time / len(rows) if rows else 0.0

    lines = [
        f"Experiment: {EXPERIMENT_NAME}",
        f"Model: {MODEL_NAME}",
        f"Timestamp: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"Valid resumes: {', '.join(valid_resumes)}",
        f"Labeled pairs: {len(rows)}",
        f"Model load time: {model_load_time:.3f}s",
        f"Total processing time: {total_time:.3f}s",
        f"Average pair time: {avg_pair_time:.3f}s",
        "",
        f"Precision@1: {fmt(metrics['Precision@1'])}",
        f"Precision@3: {fmt(metrics['Precision@3'])}",
        f"Recall@1: {fmt(metrics['Recall@1'])}",
        f"Recall@3: {fmt(metrics['Recall@3'])}",
        f"NDCG@1: {fmt(metrics['NDCG@1'])}",
        f"NDCG@3: {fmt(metrics['NDCG@3'])}",
        "",
        "Per-resume ranking:",
    ]
    for item in per_resume:
        lines.extend([f"resume_id: {item['resume_id']}", f"ranking: {rank_text(item['ranked'])}"])

    baseline = parse_baseline_metrics()
    if baseline:
        lines.extend(["", "Comparison", "--------------------------", "Metric          TF-IDF+Rule   Embedding+Rule"])
        for name in ("Precision@1", "Precision@3", "Recall@1", "Recall@3", "NDCG@1", "NDCG@3"):
            lines.append(f"{name:<15} {baseline.get(name, 'N/A'):<12} {fmt(metrics[name])}")

    render_report(lines)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
