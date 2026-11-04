import os
import sqlite3
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent


class DatabaseLifecycleTests(unittest.TestCase):
    def run_python(self, code, database, *, allow_create, cwd=BACKEND_DIR, check=True):
        env = os.environ.copy()
        env.update(
            DATABASE_URL=f"sqlite:///{database.as_posix()}",
            DATABASE_ALLOW_CREATE="true" if allow_create else "false",
            SECRET_KEY="test-only-secret",
            PYTHONPATH=str(BACKEND_DIR),
        )
        result = subprocess.run(
            [sys.executable, "-c", textwrap.dedent(code)],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if check and result.returncode != 0:
            self.fail(f"Subprocess failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
        return result

    def test_relative_sqlite_path_is_backend_relative_from_any_cwd(self):
        code = """
            from app.database import database_path
            print(database_path)
        """
        env = os.environ.copy()
        env.update(
            DATABASE_URL="sqlite:///./relative-test.db",
            DATABASE_ALLOW_CREATE="true",
            PYTHONPATH=str(BACKEND_DIR),
        )
        paths = []
        for cwd in (BACKEND_DIR, REPO_DIR):
            result = subprocess.run(
                [sys.executable, "-c", textwrap.dedent(code)],
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            paths.append(Path(result.stdout.strip()))
        self.assertEqual(paths, [BACKEND_DIR / "relative-test.db"] * 2)
        self.assertFalse(paths[0].exists())

    def test_missing_sqlite_file_fails_without_creating_it(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "missing.db"
            result = self.run_python("import app.database", database, allow_create=False, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Startup was stopped", result.stderr)
            self.assertFalse(database.exists())

    def test_data_survives_backend_restart(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "persistent.db"
            self.run_python(
                """
                from app import models
                from app.database import Base, SessionLocal, engine

                Base.metadata.create_all(engine)
                with SessionLocal() as session:
                    session.add(models.User(
                        email="restart@example.test",
                        hashed_password="unchanged-hash",
                        role="candidate",
                        full_name="Restart Test",
                    ))
                    session.commit()
                engine.dispose()
                """,
                database,
                allow_create=True,
            )
            result = self.run_python(
                """
                from sqlalchemy import select
                from app.main import app
                from app.database import SessionLocal
                from app.models import User

                with SessionLocal() as session:
                    user = session.scalar(select(User).where(User.email == "restart@example.test"))
                    print(f"{app.title}|{user.email}|{user.hashed_password}")
                """,
                database,
                allow_create=False,
            )
            self.assertIn("restart@example.test|unchanged-hash", result.stdout)

    def test_alembic_baseline_creates_startable_schema(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "migrated.db"
            env = os.environ.copy()
            env.update(
                DATABASE_URL=f"sqlite:///{database.as_posix()}",
                DATABASE_ALLOW_CREATE="true",
                PYTHONPATH=str(BACKEND_DIR),
            )
            subprocess.run(
                [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            env["DATABASE_ALLOW_CREATE"] = "false"
            migration_check = subprocess.run(
                [sys.executable, "-m", "alembic", "-c", "alembic.ini", "check"],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("No new upgrade operations detected", migration_check.stdout)
            result = self.run_python("import app.main; print('startable')", database, allow_create=False)
            self.assertIn("startable", result.stdout)

    def test_cv_builder_migration_preserves_existing_users_and_resumes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "pre-cv-builder.db"
            env = os.environ.copy()
            env.update(
                DATABASE_URL=f"sqlite:///{database.as_posix()}",
                DATABASE_ALLOW_CREATE="true",
                PYTHONPATH=str(BACKEND_DIR),
            )
            subprocess.run(
                [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "20261026_01"],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    """
                    INSERT INTO users
                        (email, hashed_password, role, full_name, phone, is_active, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("preserved@example.test", "unchanged-password-hash", "candidate", "Test Candidate", "", 1, "2026-10-27"),
                )
                user_id = connection.execute("SELECT id FROM users").fetchone()[0]
                connection.execute(
                    """
                    INSERT INTO resumes
                        (candidate_id, filename, raw_text, skills, experience_years, education, projects, summary, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, "existing.pdf", "Python FastAPI", "python, fastapi", 2, "", "", "existing", "2026-10-27"),
                )
                connection.commit()
            finally:
                connection.close()

            env["DATABASE_ALLOW_CREATE"] = "false"
            preflight = subprocess.run(
                [sys.executable, "scripts/check_schema.py", "--pre-cv-builder"],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("pre-CV-Builder baseline", preflight.stdout)
            subprocess.run(
                [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )

            connection = sqlite3.connect(database)
            try:
                self.assertEqual(
                    connection.execute("SELECT email, hashed_password FROM users").fetchone(),
                    ("preserved@example.test", "unchanged-password-hash"),
                )
                self.assertEqual(connection.execute("SELECT filename, raw_text FROM resumes").fetchone(), ("existing.pdf", "Python FastAPI"))
                tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
                self.assertTrue({"cv_drafts", "cv_draft_exports"}.issubset(tables))
                self.assertIn("active_resume_id", {row[1] for row in connection.execute("PRAGMA table_info(users)")})
                draft_columns = {row[1] for row in connection.execute("PRAGMA table_info(cv_drafts)")}
                self.assertTrue({"portrait_filename", "portrait_mime", "portrait_sha256"}.issubset(draft_columns))
                self.assertEqual(connection.execute("SELECT version_num FROM alembic_version").fetchone()[0], "20261027_03")
            finally:
                connection.close()

    def test_backup_is_verified_and_preserves_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            database = temp_path / "source.db"
            connection = sqlite3.connect(database)
            try:
                connection.execute("CREATE TABLE marker (value TEXT NOT NULL)")
                connection.execute("INSERT INTO marker VALUES ('preserved')")
                connection.commit()
            finally:
                connection.close()
            output_dir = temp_path / "backups"
            env = os.environ.copy()
            env["PYTHONPATH"] = str(BACKEND_DIR)
            subprocess.run(
                [
                    sys.executable,
                    "scripts/backup_sqlite.py",
                    "--database-url",
                    f"sqlite:///{database.as_posix()}",
                    "--output-dir",
                    str(output_dir),
                ],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            backups = list(output_dir.glob("*.sqlite3"))
            self.assertEqual(len(backups), 1)
            connection = sqlite3.connect(backups[0])
            try:
                self.assertEqual(connection.execute("SELECT value FROM marker").fetchone()[0], "preserved")
            finally:
                connection.close()

    def test_login_roles_and_ats_routes_remain_compatible(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "api.db"
            result = self.run_python(
                """
                from fastapi.testclient import TestClient
                from app import models
                from app.database import Base, SessionLocal, engine
                from app.security import hash_password

                Base.metadata.create_all(engine)
                with SessionLocal() as session:
                    password_hash = hash_password("Password123")
                    admin = models.User(email="admin@example.com", hashed_password=password_hash, role="admin", full_name="Admin")
                    recruiter = models.User(email="recruiter@example.com", hashed_password=password_hash, role="recruiter", full_name="Recruiter")
                    candidate = models.User(email="candidate@example.com", hashed_password=password_hash, role="candidate", full_name="Candidate")
                    session.add_all([admin, recruiter, candidate])
                    session.flush()
                    company = models.Company(name="Test Company", recruiter_id=recruiter.id)
                    session.add(company)
                    session.flush()
                    job = models.Job(title="Backend", description="FastAPI", recruiter_id=recruiter.id, company_id=company.id)
                    resume = models.Resume(candidate_id=candidate.id, filename="cv.pdf", raw_text="Python FastAPI experience")
                    session.add_all([job, resume])
                    session.flush()
                    application = models.Application(candidate_id=candidate.id, job_id=job.id, resume_id=resume.id)
                    session.add(application)
                    session.commit()
                    job_id, application_id = job.id, application.id

                from app.main import app
                client = TestClient(app)

                def token(email):
                    response = client.post("/api/auth/login", json={"email": email, "password": "Password123"})
                    assert response.status_code == 200, response.text
                    return {"Authorization": "Bearer " + response.json()["access_token"]}

                admin_headers = token("admin@example.com")
                recruiter_headers = token("recruiter@example.com")
                candidate_headers = token("candidate@example.com")
                assert client.get("/api/stats/admin", headers=admin_headers).status_code == 200
                assert client.get("/api/stats/recruiter", headers=recruiter_headers).status_code == 200
                assert client.get("/api/stats/candidate", headers=candidate_headers).status_code == 200
                assert client.get(f"/api/jobs/{job_id}/applications", headers=recruiter_headers).status_code == 200
                transition = client.patch(
                    f"/api/applications/{application_id}/status",
                    headers=recruiter_headers,
                    json={"status": "screening", "reason": "ATS compatibility"},
                )
                assert transition.status_code == 200, transition.text
                history = client.get(f"/api/applications/{application_id}/history", headers=candidate_headers)
                assert history.status_code == 200 and history.json()[0]["new_status"] == "screening", history.text
                print("api-compatible")
                """,
                database,
                allow_create=True,
            )
            self.assertIn("api-compatible", result.stdout)


if __name__ == "__main__":
    unittest.main()
