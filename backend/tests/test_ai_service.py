import unittest
from datetime import date
from types import SimpleNamespace

from app.ai_service import (
    ScoringContext, expand_skills, extract_education, extract_experience, extract_projects,
    extract_skills, match_candidate, recommend_jobs_for_resume,
)

NOW = date(2026, 10, 20)

BACKEND_CV = (
    "Le Van An - Backend Developer\n"
    "3 years of experience with Python, FastAPI, Django, SQL, PostgreSQL, Docker, Git and REST API.\n"
    "Education: Bachelor of Computer Science, Hanoi University of Science and Technology.\n"
    "Project: Built a microservices job-matching platform on GitHub using FastAPI and Docker.\n"
)
FRONTEND_CV = (
    "Pham Thi Bich - Frontend Developer\n"
    "2 years experience with React, JavaScript, TypeScript, HTML, CSS, Git.\n"
    "Education: Bachelor of Information Technology, University of Economics.\n"
    "Project: Portfolio website and an e-commerce dashboard built with React.\n"
)
JOBS = [
    SimpleNamespace(id=1, title="Backend Developer (Python/FastAPI)", skills="python, fastapi, sql, docker, git, rest api",
                    min_experience=1, description="Backend Developer với Python, FastAPI, SQL và Docker, microservices, REST API, git."),
    SimpleNamespace(id=2, title="Frontend Developer (React)", skills="react, javascript, typescript, html, css, git",
                    min_experience=0.5, description="Frontend Developer thành thạo React, JavaScript/TypeScript, HTML/CSS."),
    SimpleNamespace(id=3, title="Data Analyst", skills="sql, excel, power bi, python, pandas",
                    min_experience=1, description="Phân tích dữ liệu kinh doanh, báo cáo Power BI, truy vấn SQL."),
]


class SkillExtractionTests(unittest.TestCase):
    def test_substrings_inside_other_words_are_not_skills(self):
        text = "Excellent communication. Planned scenarios. Wrote JavaScript."
        skills = extract_skills(text)
        for wrong in ("excel", "ios", "java"):
            self.assertNotIn(wrong, skills)
        self.assertIn("javascript", skills)

    def test_github_is_not_reported_as_git(self):
        self.assertEqual(extract_skills("Projects hosted on GitHub"), ["github"])

    def test_aliases_and_symbols(self):
        text = "Node.js, C++, C#, .NET, CI/CD, k8s, Postgres, PowerBI, Next.js, scikit-learn, Spring Boot"
        self.assertEqual(
            set(extract_skills(text)),
            {"node.js", "c++", "c#", ".net", "ci/cd", "kubernetes", "postgresql", "power bi",
             "next.js", "scikit-learn", "spring boot"},
        )

    def test_vietnamese_phrases_and_decomposed_unicode(self):
        import unicodedata
        text = unicodedata.normalize("NFD", "Xử lý ngôn ngữ tự nhiên và quản lý dự án")
        self.assertEqual(set(extract_skills(text)), {"nlp", "project management"})

    def test_implications_are_only_used_for_matching(self):
        self.assertEqual(extract_skills("Django developer"), ["django"])
        self.assertIn("python", expand_skills(["django"]))
        self.assertIn("sql", expand_skills(["mysql"]))


class AmbiguousWordTests(unittest.TestCase):
    def test_verbs_and_adjectives_are_not_frameworks(self):
        self.assertEqual(extract_skills("I react quickly to feedback. Swift delivery of projects."), [])

    def test_proper_names_and_skill_lists_are_kept(self):
        self.assertEqual(extract_skills("Built UIs in React and Swift apps."), ["react", "swift"])
        self.assertEqual(extract_skills("skills: react, vue, node.js"), ["node.js", "react", "vue"])
        self.assertEqual(extract_skills("React developer with 3 years"), ["react"])


class ExperienceTests(unittest.TestCase):
    def test_age_and_company_age_are_not_experience(self):
        text = "The company is 10 years old. Graduated 2 years ago. 25 years old."
        self.assertEqual(extract_experience(text, NOW), 0.0)

    def test_explicit_phrases(self):
        self.assertEqual(extract_experience("5+ years of experience in sales", NOW), 5.0)
        self.assertEqual(extract_experience("Kinh nghiệm 3 năm với Python", NOW), 3.0)
        self.assertEqual(extract_experience("Senior with 7 years' experience", NOW), 7.0)
        self.assertEqual(extract_experience("6 months of experience as intern", NOW), 0.5)

    def test_date_ranges_exclude_education_and_merge_overlap(self):
        text = (
            "EXPERIENCE\nDeveloper, ACME Jan 2019 - Mar 2022\nSenior Dev, Foo 2021 - present\n"
            "EDUCATION\nBachelor 2012 - 2016\n"
        )
        # Jan 2019 -> Oct 2026 sau khi gộp phần chồng nhau
        self.assertEqual(extract_experience(text, NOW), 7.8)

    def test_education_only_dates_give_zero(self):
        self.assertEqual(extract_experience("Education\nB.Sc 2018 - 2022\nProjects\nApp 2021 - 2022", NOW), 0.0)


class SectionTests(unittest.TestCase):
    def test_scrum_master_is_not_education(self):
        hits = extract_education("Scrum Master at X\nBachelor of Computer Science, HUST")
        self.assertEqual(hits, ["Bachelor of Computer Science, HUST"])

    def test_projects_section_and_inline_prefix(self):
        text = "Projects\n- Job matcher using FastAPI\n- Portfolio site in React\nEducation\nBachelor of CS\n"
        self.assertEqual(extract_projects(text), ["Job matcher using FastAPI", "Portfolio site in React"])
        self.assertEqual(extract_projects("Project: Built a chat app with Redis"), ["Built a chat app with Redis"])


class MatchingTests(unittest.TestCase):
    def test_result_keeps_v1_fields(self):
        m = match_candidate("desc", "python", 1, BACKEND_CV, ["python"], 3, now=NOW)
        for key in ("skill_score", "experience_score", "semantic_score", "project_score", "final_score",
                    "explanation", "job_skills", "missing_skills", "matched_skills"):
            self.assertIn(key, m)
        self.assertIsInstance(m["warnings"], list)

    def test_skill_outside_catalog_is_found_in_text(self):
        cv = ("Platform engineer. Wrote Terraform modules and planned the product roadmap for two teams. " * 4)
        m = match_candidate("d", "Terraform, Roadmap, Nginx", 0, cv, [], 0, now=NOW)
        self.assertEqual(m["matched_skills"], ["roadmap", "terraform"])
        self.assertEqual(m["missing_skills"], ["nginx"])

    def test_implied_skill_satisfies_requirement(self):
        m = match_candidate("d", "python, sql", 0, "Backend dev using Django and MySQL. " * 8, [], 0, now=NOW)
        self.assertEqual(m["missing_skills"], [])
        self.assertEqual(m["skill_score"], 100.0)

    def test_stale_stored_skills_do_not_override_resume_text(self):
        # v1 từng lưu "excel" cho chữ "excellent"; điểm phải dựa trên văn bản CV.
        m = match_candidate("d", "excel", 0, "Excellent communicator and team player. " * 8, ["excel"], 0, now=NOW)
        self.assertEqual(m["missing_skills"], ["excel"])

    def test_empty_text_falls_back_to_stored_skills(self):
        m = match_candidate("d", "python", 0, "", ["python"], 2)
        self.assertEqual(m["matched_skills"], ["python"])

    def test_warnings_for_thin_resume(self):
        m = match_candidate("d", "python", 2, "Python", [], 0, now=NOW)
        self.assertTrue(any("ít văn bản" in w for w in m["warnings"]))
        self.assertIn("Lưu ý", m["explanation"])

    def test_missing_experience_is_flagged(self):
        cv = "Backend developer using Python and Docker. " * 10
        m = match_candidate("d", "python", 2, cv, [], 0, now=NOW)
        self.assertTrue(any("số năm kinh nghiệm" in w for w in m["warnings"]))

    def test_project_score_rewards_relevant_projects(self):
        with_projects = match_candidate("d", "python, fastapi, docker", 0, BACKEND_CV, [], 0, now=NOW)
        without = match_candidate("d", "python, fastapi, docker", 0,
                                  "Backend developer with Python, FastAPI and Docker skills. " * 6, [], 0, now=NOW)
        self.assertGreater(with_projects["project_score"], without["project_score"])
        self.assertEqual(without["project_score"], 0.0)


class PartialCreditTests(unittest.TestCase):
    JOB = "React, TypeScript, CSS"
    PAD = " Worked daily on web interfaces and product features." * 6

    def _score(self, cv):
        return match_candidate("d", self.JOB, 0, cv + self.PAD, [], 0, now=NOW)

    def test_related_skill_gets_partial_credit_and_is_explained(self):
        m = self._score("Vue, TypeScript, CSS.")
        self.assertEqual(m["matched_skills"], ["css", "typescript"])
        self.assertEqual(m["partial_skills"], ["vue (tương đương react)"])
        self.assertEqual(m["missing_skills"], [])
        self.assertEqual(m["skill_score"], 83.33)
        self.assertIn("vue (tương đương react)", m["explanation"])

    def test_ordering_exact_then_related_then_missing(self):
        exact = self._score("React, TypeScript, CSS.")["skill_score"]
        related = self._score("Vue, TypeScript, CSS.")["skill_score"]
        none = self._score("Excel, SQL, Power BI.")["skill_score"]
        self.assertGreater(exact, related)
        self.assertGreater(related, none)

    def test_learning_a_skill_counts_half(self):
        m = self._score("Currently learning React.\nTypeScript, CSS.")
        self.assertEqual(m["partial_skills"], ["react (mới học/cơ bản)"])
        self.assertEqual(m["skill_score"], 83.33)

    def test_machine_learning_is_not_a_hedge(self):
        # lỗi từng gặp: chữ "learning" trong "machine learning" bị coi là đang học
        cv = "4 years of experience in Python, machine learning, deep learning, pytorch." + self.PAD
        m = match_candidate("d", "python, machine learning, pytorch", 0, cv, [], 0, now=NOW)
        self.assertEqual(m["partial_skills"], [])
        self.assertEqual(m["skill_score"], 100.0)

    def test_vietnamese_hedge(self):
        m = match_candidate("d", "docker", 0, "Đang học Docker, kiến thức cơ bản về Linux." + self.PAD, [], 0, now=NOW)
        self.assertEqual(m["partial_skills"], ["docker (mới học/cơ bản)"])

    def test_strong_mention_wins_over_hedged_mention(self):
        m = self._score("Basic Docker at first.\nReact, TypeScript, CSS in production.\nLater used React at scale.")
        self.assertEqual(m["partial_skills"], [])
        self.assertEqual(m["skill_score"], 100.0)


class RankingTests(unittest.TestCase):
    def test_each_cv_ranks_its_own_field_first(self):
        for cv, expected in ((BACKEND_CV, 1), (FRONTEND_CV, 2)):
            ranked = recommend_jobs_for_resume(cv, extract_skills(cv), extract_experience(cv, NOW), JOBS, now=NOW)
            self.assertEqual(ranked[0]["job"].id, expected)

    def test_shared_context_gives_same_score_as_single_match(self):
        ctx = ScoringContext.from_jobs(JOBS)
        ranked = recommend_jobs_for_resume(BACKEND_CV, [], 0, JOBS, context=ctx, now=NOW)
        job = ranked[0]["job"]
        single = match_candidate(job.description, job.skills, job.min_experience, BACKEND_CV, [], 0,
                                 job_title=job.title, context=ctx, now=NOW)
        self.assertEqual(single["final_score"], ranked[0]["match"]["final_score"])

    def test_scores_are_bounded(self):
        for job in JOBS:
            m = match_candidate(job.description, job.skills, job.min_experience, BACKEND_CV, [], 0,
                                job_title=job.title, context=ScoringContext.from_jobs(JOBS), now=NOW)
            for key in ("skill_score", "experience_score", "semantic_score", "project_score", "final_score"):
                self.assertTrue(0 <= m[key] <= 100, (key, m[key]))


if __name__ == "__main__":
    unittest.main()
