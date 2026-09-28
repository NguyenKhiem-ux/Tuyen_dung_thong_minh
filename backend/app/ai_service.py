import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

SKILL_VOCAB = [
    "python", "java", "javascript", "typescript", "react", "next.js", "vue", "angular",
    "node.js", "fastapi", "django", "flask", "spring boot", "php", "laravel", "sql",
    "mysql", "postgresql", "mongodb", "redis", "docker", "kubernetes", "git", "linux",
    "aws", "azure", "gcp", "machine learning", "deep learning", "nlp", "computer vision",
    "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "power bi", "tableau",
    "excel", "rest api", "graphql", "microservices", "ci/cd", "agile", "scrum",
    "c#", ".net", "c++", "golang", "swift", "kotlin", "android", "ios", "figma",
    "photoshop", "seo", "digital marketing", "project management", "html", "css",
]

EDUCATION_KEYWORDS = [
    "university", "đại học", "cao đẳng", "college", "bachelor", "master", "phd",
    "cử nhân", "thạc sĩ", "tiến sĩ", "kỹ sư", "engineer degree",
]

PROJECT_KEYWORDS = ["project", "dự án", "github", "portfolio", "capstone", "implementation"]


def extract_text_from_file(path: str, filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        import fitz
        doc = fitz.open(path)
        return "\n".join(page.get_text() for page in doc)
    if ext == "docx":
        from docx import Document
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs)
    raise ValueError("Only PDF and DOCX files are supported")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def extract_skills(text: str) -> list[str]:
    t = normalize_text(text)
    found = [skill for skill in SKILL_VOCAB if skill in t]
    return sorted(set(found))


def extract_experience(text: str) -> float:
    t = normalize_text(text)
    patterns = [
        r"(\d+(?:\.\d+)?)\s*\+?\s*years?",
        r"(\d+(?:\.\d+)?)\s*years?\s*(?:of)?\s*experience",
        r"(\d+(?:\.\d+)?)\s*năm\s*kinh nghiệm",
    ]
    vals = []
    for p in patterns:
        vals.extend(float(x) for x in re.findall(p, t))
    return max(vals) if vals else 0.0


def extract_education(text: str) -> list[str]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    hits = []
    for line in lines:
        low = line.lower()
        if any(kw in low for kw in EDUCATION_KEYWORDS):
            hits.append(line[:200])
    return hits[:5]


def extract_projects(text: str) -> list[str]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    hits = []
    for line in lines:
        low = line.lower()
        if any(kw in low for kw in PROJECT_KEYWORDS) and len(line) > 8:
            hits.append(line[:200])
    return hits[:8]


def similarity(a: str, b: str) -> float:
    if not a.strip() or not b.strip():
        return 0.0
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=3000)
    matrix = vec.fit_transform([a, b])
    return float(cosine_similarity(matrix[0:1], matrix[1:2])[0][0])


def match_candidate(job_description: str, job_skills: str, min_exp: float,
                     resume_text: str, resume_skills: list[str], resume_exp: float):
    job_skill_list = [s.strip().lower() for s in job_skills.split(",") if s.strip()]
    if not job_skill_list:
        job_skill_list = extract_skills(job_description)

    candidate_set = set(resume_skills)
    required_set = set(job_skill_list)

    skill_score = 100.0 if not required_set else len(candidate_set & required_set) / len(required_set) * 100
    experience_score = 100.0 if min_exp <= 0 else min(resume_exp / min_exp, 1.0) * 100
    semantic_score = similarity(job_description, resume_text) * 100
    project_score = similarity(
        "project portfolio github implementation system api application dự án", resume_text
    ) * 100

    final = round(
        0.40 * skill_score + 0.25 * experience_score + 0.20 * semantic_score + 0.15 * project_score, 2
    )

    missing = sorted(required_set - candidate_set)
    matched = sorted(candidate_set & required_set)

    explanation = (
        f"Phù hợp {final}%. Kỹ năng khớp: {', '.join(matched) if matched else 'chưa xác định'}. "
        f"Kinh nghiệm hồ sơ: {resume_exp:g} năm; yêu cầu: {min_exp:g} năm. "
        f"Kỹ năng còn thiếu: {', '.join(missing) if missing else 'không phát hiện kỹ năng bắt buộc còn thiếu'}. "
        f"Điểm ngữ nghĩa: {semantic_score:.1f}% và điểm dự án: {project_score:.1f}%."
    )

    return {
        "skill_score": round(skill_score, 2),
        "experience_score": round(experience_score, 2),
        "semantic_score": round(semantic_score, 2),
        "project_score": round(project_score, 2),
        "final_score": final,
        "explanation": explanation,
        "job_skills": job_skill_list,
        "missing_skills": missing,
        "matched_skills": matched,
    }


def recommend_jobs_for_resume(resume_text: str, resume_skills: list[str], resume_exp: float, jobs: list) -> list[dict]:
    """Rank a list of Job ORM objects against a candidate resume."""
    scored = []
    for job in jobs:
        m = match_candidate(job.description, job.skills, job.min_experience, resume_text, resume_skills, resume_exp)
        scored.append({"job": job, "match": m})
    scored.sort(key=lambda x: x["match"]["final_score"], reverse=True)
    return scored
