"""So sánh engine AI v1 (legacy) và v2 trên các ca có đáp án gán tay.

Chạy:  python evaluation/extraction_benchmark.py
Kết quả được ghi vào evaluation/results/extraction_benchmark.txt.

Lưu ý quan trọng: đáp án do người viết dự án gán tay trên các đoạn CV ngắn, mục đích là
kiểm tra hồi quy cho các lỗi đã biết, KHÔNG thay thế việc đánh giá trên CV thật.
Phần kỹ năng chỉ xét các kỹ năng có mặt ở cả hai bản từ điển để so sánh công bằng.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import legacy_ai_service as old  # noqa: E402
from app import ai_service as new  # noqa: E402

NOW = date(2026, 10, 20)

# (văn bản, kỹ năng đúng). Chỉ các kỹ năng thuộc từ điển chung được tính.
SKILL_CASES = [
    ("Excellent communication skills. Planned release scenarios for the team.", []),
    ("Wrote Excel macros for finance reports.", ["excel"]),
    ("Proficient in JavaScript and TypeScript, familiar with React.", ["javascript", "typescript", "react"]),
    ("Only JavaScript for the front end.", ["javascript"]),
    ("Java and JavaScript developer.", ["java", "javascript"]),
    ("Skills: Python3, Node.js, C++, C#, .NET", ["python", "node.js", "c++", "c#", ".net"]),
    ("Deployed with k8s on AWS using CI/CD pipelines.", ["kubernetes", "aws", "ci/cd"]),
    ("Caching with Redis, data in Postgres and MongoDB.", ["redis", "postgresql", "mongodb"]),
    ("Built dashboards with PowerBI and Tableau.", ["power bi", "tableau"]),
    ("Used scikit-learn, sklearn, PyTorch and TensorFlow.", ["scikit-learn", "pytorch", "tensorflow"]),
    ("Kinh nghiệm xử lý ngôn ngữ tự nhiên (NLP) và machine learning.", ["nlp", "machine learning"]),
    ("Sử dụng Docker, Linux và Git hàng ngày.", ["docker", "linux", "git"]),
    ("Built REST APIs with FastAPI.", ["rest api", "fastapi"]),
    ("Scrum Master for two squads.", ["scrum"]),
    ("Designed in Figma and Photoshop; SEO for the blog.", ["figma", "photoshop", "seo"]),
    ("Android and iOS apps in Kotlin and Swift.", ["android", "ios", "kotlin", "swift"]),
    ("Golang microservices behind Nginx.", ["golang", "microservices"]),
    ("Cloud: AWS, Azure, GCP.", ["aws", "azure", "gcp"]),
    ("Used Git and GitHub Actions every day.", ["git"]),
    ("I react quickly to customer feedback.", []),
    ("Swift delivery of projects to clients.", []),
    ("Built UIs in React. Skills: react, vue, node.js.", ["react", "vue", "node.js"]),
    ("React developer with strong CSS skills.", ["react", "css"]),
]

# (văn bản, số năm đúng)
EXP_CASES = [
    ("5+ years of experience in sales", 5.0),
    ("The company is 10 years old and I joined 2 years ago.", 0.0),
    ("Graduated 3 years ago.", 0.0),
    ("Kinh nghiệm 3 năm với Python", 3.0),
    ("Hơn 2 năm kinh nghiệm backend", 2.0),
    ("6 months of experience as an intern", 0.5),
    ("Senior engineer with 7 years' experience", 7.0),
    ("Total experience: 4 years", 4.0),
    ("Team of 12 engineers, 3 years in backend", 3.0),
    ("Age 25 years old, 3 years experience", 3.0),
    ("EXPERIENCE\nDeveloper, ACME  Jan 2019 - Mar 2022\nEDUCATION\nBachelor 2012 - 2016", 3.2),
    ("Work History\nAnalyst 2020 - present", 6.8),
    ("Experience\nIntern Jun 2024 - Aug 2024\nDeveloper Sep 2024 - present", 2.3),
    ("Experience: 2 years at X (2019-2021), 3 years at Y (2021-2024)", 5.0),
    ("Fresher, no working experience yet", 0.0),
    ("Education\nB.Sc 2018 - 2022\nProjects\nMobile app 2021 - 2022", 0.0),
]

JOBS = [  # lấy từ seed_demo.py
    ("Backend Developer (Python/FastAPI)", "python, fastapi, sql, docker, git, rest api", 1,
     "Backend Developer có kinh nghiệm với Python, FastAPI, SQL và Docker để xây dựng microservices cho nền tảng tuyển dụng AI. Kinh nghiệm REST API và git."),
    ("Frontend Developer (React)", "react, javascript, typescript, html, css, git", 0.5,
     "Frontend Developer thành thạo React, JavaScript/TypeScript, HTML/CSS để phát triển giao diện người dùng cho sản phẩm SaaS."),
    ("Data Analyst", "sql, excel, power bi, python, pandas", 1,
     "Phân tích dữ liệu kinh doanh, xây dựng báo cáo Power BI, viết SQL truy vấn dữ liệu."),
    ("Machine Learning Engineer", "python, pytorch, tensorflow, nlp, machine learning, docker", 2,
     "Machine Learning Engineer có kinh nghiệm pytorch/tensorflow, NLP và triển khai mô hình vào production."),
]
RESUMES = [  # (tên, văn bản, các job đúng ở vị trí đầu)
    ("Backend", "Le Van An - Backend Developer\n3 years of experience with Python, FastAPI, Django, SQL, PostgreSQL, Docker, Git and REST API.\n"
     "Education: Bachelor of Computer Science, Hanoi University of Science and Technology.\n"
     "Project: Built a microservices job-matching platform on GitHub using FastAPI and Docker.\n", {0}),
    ("Frontend", "Pham Thi Bich - Frontend Developer\n2 years experience with React, JavaScript, TypeScript, HTML, CSS, Git.\n"
     "Education: Bachelor of Information Technology, University of Economics.\n"
     "Project: Portfolio website and an e-commerce dashboard built with React.\n", {1}),
    ("Data & ML", "Hoang Van Cuong - Data & ML\n4 years of experience in Python, pandas, numpy, SQL, machine learning, pytorch, NLP.\n"
     "Education: Master of Data Science, Vietnam National University.\n"
     "Project: Implemented an NLP resume-matching system and a churn-prediction project on GitHub.\n", {2, 3}),
]


def skill_metrics(engine):
    vocab = set(old.SKILL_VOCAB) & set(new.SKILL_VOCAB)
    tp = fp = fn = 0
    for text, expected in SKILL_CASES:
        got = {s for s in engine.extract_skills(text) if s in vocab}
        want = set(expected)
        tp += len(got & want)
        fp += len(got - want)
        fn += len(want - got)
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1, fp, fn


def exp_accuracy(engine, with_now):
    ok = 0
    for text, want in EXP_CASES:
        got = engine.extract_experience(text, NOW) if with_now else engine.extract_experience(text)
        ok += abs(got - want) <= 0.3
    return ok / len(EXP_CASES)


def ranking(engine, is_new):
    hits, detail = 0, []
    for name, text, good in RESUMES:
        skills = engine.extract_skills(text)
        exp = engine.extract_experience(text, NOW) if is_new else engine.extract_experience(text)
        scores = []
        if is_new:
            ctx = new.ScoringContext([new.job_text(t, s, d) for t, s, _, d in JOBS])
        for i, (title, jskills, min_exp, desc) in enumerate(JOBS):
            if is_new:
                m = engine.match_candidate(desc, jskills, min_exp, text, skills, exp, job_title=title, context=ctx, now=NOW)
            else:
                m = engine.match_candidate(desc, jskills, min_exp, text, skills, exp)
            scores.append((m["final_score"], i))
        scores.sort(reverse=True)
        hits += scores[0][1] in good
        detail.append((name, [f"{JOBS[i][0].split(' (')[0]} {s:.1f}" for s, i in scores[:2]]))
    return hits, len(RESUMES), detail


def main():
    lines = ["Benchmark engine AI: v1 (legacy) và v2", "=" * 60]
    lines.append(f"Kỹ năng ({len(SKILL_CASES)} ca, chỉ tính từ điển chung)")
    for name, eng in (("v1", old), ("v2", new)):
        p, r, f1, fp, fn = skill_metrics(eng)
        lines.append(f"  {name}: precision={p:.3f} recall={r:.3f} F1={f1:.3f} (nhận nhầm={fp}, bỏ sót={fn})")
    lines.append(f"Kinh nghiệm ({len(EXP_CASES)} ca, sai số <= 0.3 năm)")
    lines.append(f"  v1: {exp_accuracy(old, False):.3f}")
    lines.append(f"  v2: {exp_accuracy(new, True):.3f}")
    lines.append("Xếp hạng mẫu (3 CV x 4 tin trong seed_demo)")
    for name, eng, is_new in (("v1", old, False), ("v2", new, True)):
        hits, total, detail = ranking(eng, is_new)
        lines.append(f"  {name}: top-1 đúng {hits}/{total}")
        for cv, top in detail:
            lines.append(f"      {cv}: " + " | ".join(top))
    out = "\n".join(lines)
    print(out)
    result = Path(__file__).resolve().parent / "results" / "extraction_benchmark.txt"
    result.write_text(out + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
