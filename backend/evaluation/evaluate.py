from __future__ import annotations

import csv
import math
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path


CSV_PATH = Path(__file__).resolve().parent / "data" / "cv_jd_labels.csv"
VALIDITY_PATH = Path(__file__).resolve().parent / "data" / "resume_validity.csv"
RESULT_PATH = Path(__file__).resolve().parent / "results" / "baseline_tfidf_rule.txt"
BASELINE_NAME = "TF-IDF + Rule-based v1"
VALID_LABELS = {"0", "1", "2", "3"}
REQUIRED_COLUMNS = {"resume_id", "job_id", "job_title", "ai_score", "human_relevance"}
VALIDITY_COLUMNS = {"resume_id", "valid_for_evaluation", "reason"}


def parse_validity(path: Path):
    if not path.exists():
        return {}, [f"Validity CSV not found: {path}"]

    try:
        lines = read_csv_lines(path)
    except UnicodeError as exc:
        return {}, [str(exc)]

    validity = {}
    errors = []
    reader = csv.DictReader(lines)
    missing = VALIDITY_COLUMNS - set(reader.fieldnames or [])
    if missing:
        return {}, [f"Missing validity column(s): {', '.join(sorted(missing))}"]

    for line_no, row in enumerate(reader, start=2):
        resume_id = (row.get("resume_id") or "").strip()
        flag = (row.get("valid_for_evaluation") or "").strip().lower()
        if flag not in {"true", "false"}:
            errors.append(f"Line {line_no}: valid_for_evaluation must be true or false")
            continue
        validity[resume_id] = {
            "valid": flag == "true",
            "reason": (row.get("reason") or "").strip(),
        }
    return validity, errors


def parse_rows(path: Path, validity: dict):
    errors = []
    labeled = []
    skipped_blank_labels = 0
    excluded_rows = 0
    seen_pairs = set()

    try:
        lines = read_csv_lines(path)
    except UnicodeError as exc:
        return [], 0, [str(exc)]

    reader = csv.DictReader(lines)
    missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
    if missing:
        return [], 0, [f"Missing required column(s): {', '.join(sorted(missing))}"]

    for line_no, row in enumerate(reader, start=2):
        if not row or not any((value or "").strip() for value in row.values()):
            continue

        resume_id = (row.get("resume_id") or "").strip()
        job_id = (row.get("job_id") or "").strip()
        pair_key = (resume_id, job_id)
        if pair_key in seen_pairs:
            errors.append(f"Line {line_no}: duplicate resume_id + job_id ({resume_id}, {job_id})")
        seen_pairs.add(pair_key)

        label_text = (row.get("human_relevance") or "").strip()
        if label_text == "":
            if validity.get(resume_id, {}).get("valid", False):
                skipped_blank_labels += 1
            continue
        if label_text not in VALID_LABELS:
            errors.append(f"Line {line_no}: human_relevance must be 0, 1, 2, 3, or blank")
            continue

        if not validity.get(resume_id, {}).get("valid", False):
            excluded_rows += 1
            continue

        score_text = (row.get("ai_score") or "").strip()
        try:
            ai_score = float(score_text)
        except ValueError:
            errors.append(f"Line {line_no}: ai_score must be numeric for labeled rows")
            continue

        labeled.append(
            {
                "resume_id": resume_id,
                "job_id": job_id,
                "job_title": row.get("job_title") or "",
                "ai_score": ai_score,
                "human_relevance": int(label_text),
            }
        )

    return labeled, skipped_blank_labels, excluded_rows, errors


def read_csv_lines(path: Path):
    last_error = None
    for encoding in ("utf-8-sig", "cp1258", "cp1252"):
        try:
            return path.read_text(encoding=encoding).splitlines()
        except UnicodeDecodeError as exc:
            last_error = exc
    raise UnicodeError(f"Cannot decode CSV as utf-8-sig, cp1258, or cp1252: {last_error}")


def precision_at(items, k: int):
    top = items[:k]
    if not top:
        return None
    return sum(item["human_relevance"] >= 2 for item in top) / len(top)


def recall_at(items, k: int):
    relevant_total = sum(item["human_relevance"] >= 2 for item in items)
    if relevant_total == 0:
        return None
    return sum(item["human_relevance"] >= 2 for item in items[:k]) / relevant_total


def dcg(items, k: int):
    return sum(
        (2 ** item["human_relevance"] - 1) / math.log2(rank + 2)
        for rank, item in enumerate(items[:k])
    )


def ndcg_at(items, k: int):
    ideal = sorted(items, key=lambda item: item["human_relevance"], reverse=True)
    ideal_score = dcg(ideal, k)
    if ideal_score == 0:
        return None
    return dcg(items, k) / ideal_score


def average(values):
    values = [value for value in values if value is not None]
    return None if not values else sum(values) / len(values)


def fmt(value):
    return "N/A" if value is None else f"{value:.4f}"


def ranking(items, key):
    return ", ".join(
        f"{item['job_id']}:{item['job_title']} (AI {item['ai_score']:g}, HR {item['human_relevance']})"
        for item in sorted(items, key=key, reverse=True)
    )


def render_report(lines):
    text = "\n".join(lines) + "\n"
    print(text, end="")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(text, encoding="utf-8")


def main():
    if not CSV_PATH.exists():
        print(f"Data error: CSV not found: {CSV_PATH}")
        return 1

    validity, errors = parse_validity(VALIDITY_PATH)
    if not errors:
        labeled, skipped_blank_labels, excluded_labeled_pairs, errors = parse_rows(CSV_PATH, validity)
    else:
        labeled, skipped_blank_labels, excluded_labeled_pairs = [], 0, 0
    if errors:
        print("Data errors")
        print("-----------")
        for error in errors:
            print(f"- {error}")
        return 1

    groups = defaultdict(list)
    for row in labeled:
        groups[row["resume_id"]].append(row)

    per_resume = []
    for resume_id, items in sorted(groups.items(), key=lambda pair: int(pair[0]) if pair[0].isdigit() else pair[0]):
        ranked = sorted(items, key=lambda item: item["ai_score"], reverse=True)
        per_resume.append(
            {
                "resume_id": resume_id,
                "items": items,
                "ranked": ranked,
                "p1": precision_at(ranked, 1),
                "p3": precision_at(ranked, 3),
                "r1": recall_at(ranked, 1),
                "r3": recall_at(ranked, 3),
                "n1": ndcg_at(ranked, 1),
                "n3": ndcg_at(ranked, 3),
                "has_relevant": any(item["human_relevance"] >= 2 for item in items),
            }
        )

    job_counts = [len(result["items"]) for result in per_resume]
    jobs_summary = "N/A"
    if job_counts:
        jobs_summary = (
            f"min={min(job_counts)}, max={max(job_counts)}, "
            f"avg={sum(job_counts) / len(job_counts):.2f}"
        )

    valid_resumes = sorted(
        [resume_id for resume_id, item in validity.items() if item["valid"]],
        key=lambda item: int(item) if item.isdigit() else item,
    )
    excluded_resumes = sorted(
        [resume_id for resume_id, item in validity.items() if not item["valid"]],
        key=lambda item: int(item) if item.isdigit() else item,
    )
    no_relevant = [result["resume_id"] for result in per_resume if not result["has_relevant"]]

    metrics = {
        "Precision@1": average(result["p1"] for result in per_resume),
        "Precision@3": average(result["p3"] for result in per_resume),
        "Recall@1": average(result["r1"] for result in per_resume),
        "Recall@3": average(result["r3"] for result in per_resume),
        "NDCG@1": average(result["n1"] for result in per_resume),
        "NDCG@3": average(result["n3"] for result in per_resume),
    }

    lines = [
        f"Baseline: {BASELINE_NAME}",
        f"Timestamp: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        "",
        "Evaluation dataset",
        "------------------",
        f"Labeled pairs: {len(labeled)}",
        f"Skipped blank-label pairs: {skipped_blank_labels}",
        f"Excluded labeled pairs: {excluded_labeled_pairs}",
        f"Resumes evaluated: {len(per_resume)}",
        f"Jobs per resume: {jobs_summary}",
        f"Valid resumes: {', '.join(valid_resumes) if valid_resumes else 'none'}",
        f"Excluded resumes: {', '.join(excluded_resumes) if excluded_resumes else 'none'}",
        "Excluded reasons:",
    ]
    if excluded_resumes:
        lines.extend(
            f"- resume {resume_id}: {validity[resume_id]['reason'] or 'No reason provided'}"
            for resume_id in excluded_resumes
        )
    else:
        lines.append("- none")
    if no_relevant:
        lines.append(
            "No-relevant resumes: "
            f"{', '.join(no_relevant)} (Recall is N/A and excluded from Recall averages)"
        )
    else:
        lines.append("No-relevant resumes: none")

    lines.extend([
        "",
        "Overall metrics",
        "------------------",
        f"Precision@1: {fmt(metrics['Precision@1'])}",
        f"Precision@3: {fmt(metrics['Precision@3'])}",
        f"Recall@1: {fmt(metrics['Recall@1'])}",
        f"Recall@3: {fmt(metrics['Recall@3'])}",
        f"NDCG@1: {fmt(metrics['NDCG@1'])}",
        f"NDCG@3: {fmt(metrics['NDCG@3'])}",
        "",
        "Per-resume results",
        "------------------",
    ])
    if not per_resume:
        lines.append("No labeled rows to evaluate.")
    for result in per_resume:
        lines.extend([
            f"resume_id: {result['resume_id']}",
            f"AI ranking: {ranking(result['ranked'], lambda item: item['ai_score'])}",
            f"human relevance ranking: {ranking(result['items'], lambda item: item['human_relevance'])}",
            f"P@3: {fmt(result['p3'])}",
            f"R@3: {fmt(result['r3'])}",
            f"NDCG@3: {fmt(result['n3'])}",
            "",
        ])

    render_report(lines)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
