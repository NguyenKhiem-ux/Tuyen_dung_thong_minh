from __future__ import annotations

import csv
import re
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from embedding_experiment import (
    BASELINE_PATH,
    MODEL_NAME,
    cosine_to_score,
    dot,
    embed_texts,
    job_text,
    load_data,
    load_match_candidate,
    load_model,
    rank_text,
    split_skills,
)
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


RESULT_DIR = Path(__file__).resolve().parent / "results"
SCORES_PATH = RESULT_DIR / "hybrid_v1_scores.csv"
REPORT_PATH = RESULT_DIR / "hybrid_v1.txt"
EMBEDDING_PATH = RESULT_DIR / "embedding_rule_v1.txt"
METRIC_NAMES = ("Precision@1", "Precision@3", "Recall@1", "Recall@3", "NDCG@1", "NDCG@3")


def parse_result(path: Path) -> tuple[dict[str, str], str]:
    if not path.exists():
        return {}, "N/A"
    text = path.read_text(encoding="utf-8")
    metrics = {}
    for name in METRIC_NAMES:
        match = re.search(rf"^{re.escape(name)}:\s+([0-9.]+|N/A)", text, flags=re.MULTILINE)
        if match:
            metrics[name] = match.group(1)
    time_match = re.search(r"^Total processing time:\s+([0-9.]+s)", text, flags=re.MULTILINE)
    return metrics, time_match.group(1) if time_match else "N/A"


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
        hybrid_semantic_score = round(0.50 * rule["semantic_score"] + 0.50 * embedding_score, 2)
        final_score = round(
            0.40 * rule["skill_score"]
            + 0.25 * rule["experience_score"]
            + 0.20 * hybrid_semantic_score
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
                "tfidf_semantic_score": rule["semantic_score"],
                "embedding_score": embedding_score,
                "hybrid_semantic_score": hybrid_semantic_score,
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
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    with SCORES_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "resume_id",
                "job_id",
                "job_title",
                "skill_score",
                "experience_score",
                "tfidf_semantic_score",
                "embedding_score",
                "hybrid_semantic_score",
                "project_score",
                "final_score",
                "human_relevance",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def metric_values(metrics: dict[str, str | float]) -> tuple[float, ...]:
    order = ("NDCG@3", "Recall@3", "Precision@3", "NDCG@1", "Recall@1", "Precision@1")
    values = []
    for name in order:
        value = metrics.get(name, "N/A")
        try:
            values.append(float(value))
        except (TypeError, ValueError):
            values.append(float("-inf"))
    return tuple(values)


def conclusion(baseline, embedding, hybrid) -> str:
    methods = {
        "TF-IDF + Rule-based v1": baseline,
        "Embedding + Rule-based v1": embedding,
        "Hybrid v1": {name: fmt(hybrid[name]) for name in METRIC_NAMES},
    }
    best_score = max(metric_values(metrics) for metrics in methods.values())
    best = [name for name, metrics in methods.items() if metric_values(metrics) == best_score]
    if "Hybrid v1" in best and len(best) == len(methods):
        return "No measurable ranking improvement on current dataset."
    if "Hybrid v1" in best:
        return "Hybrid better on current dataset metrics." if len(best) == 1 else "Hybrid tied for best on current dataset metrics."
    return "Hybrid worse on current dataset metrics."


def render_report(lines):
    text = "\n".join(lines) + "\n"
    print(text, end="")
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
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
        load_start = time.perf_counter()
        model = load_model()
        model_load_time = time.perf_counter() - load_start
    except Exception as exc:
        print(f"Missing dependency/model: {exc}")
        return 1

    scoring_start = time.perf_counter()
    rows = score_pairs(labeled, resumes, jobs, model, match_candidate)
    scoring_time = time.perf_counter() - scoring_start
    write_scores(rows)

    per_resume, metrics = metric_rows(rows)
    total_time = time.perf_counter() - total_start
    avg_pair_time = scoring_time / len(rows) if rows else 0.0

    baseline, baseline_time = parse_result(BASELINE_PATH)
    embedding, embedding_time = parse_result(EMBEDDING_PATH)
    result = conclusion(baseline, embedding, metrics)

    lines = [
        "Experiment: Hybrid v1",
        f"Timestamp: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"Model: {MODEL_NAME}",
        "",
        "Semantic formula:",
        "50% TF-IDF + 50% Embedding",
        "",
        "Final formula:",
        "40% Skill",
        "25% Experience",
        "20% Hybrid Semantic",
        "15% Project",
        "",
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

    lines.extend(["", "Comparison", "------------------------------------------------"])
    lines.append("Metric          TF-IDF+Rule   Embedding+Rule   Hybrid")
    for name in METRIC_NAMES:
        lines.append(f"{name:<15} {baseline.get(name, 'N/A'):<12} {embedding.get(name, 'N/A'):<16} {fmt(metrics[name])}")
    lines.extend([
        "",
        "Performance:",
        f"TF-IDF processing time: {baseline_time}",
        f"Embedding processing time: {embedding_time}",
        f"Hybrid processing time: {total_time:.3f}s",
        "",
        f"Conclusion: {result}",
    ])

    render_report(lines)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
