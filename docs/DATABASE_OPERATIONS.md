# Database operations

## Root cause verified on this branch

The old default was `sqlite:///./smart_recruitment.db`. SQLAlchemy resolves that path from the process working directory, while Pydantic also looked for `.env` from the working directory. Starting Uvicorn from `backend/` selected `backend/smart_recruitment.db`; starting it from the repository root selected or created `./smart_recruitment.db`. `app/main.py` then ran `Base.metadata.create_all()` during import, so a wrong path silently became a valid but empty schema.

Startup also ran two SQLite `ALTER TABLE`/index operations. They were additive, not destructive, but any schema change at application startup is unsafe for a shared database. Startup now performs only a read-only schema check and exits before SQLite can create a missing file.

Relative SQLite URLs and the backend `.env` are now anchored to the physical `backend/` directory. `UPLOAD_DIR` is anchored the same way.

## Safe local SQLite workflow

Never commit a real `.env`, SQLite database, backup, or uploaded CV.

Security finding on this branch: `backend/smart_recruitment.db.bak-before-history-nullable-20261007-232212` is already tracked by Git, so ignore rules cannot protect it. No file or history was deleted by this change. A repository owner should first preserve any required copy in approved encrypted storage, remove it from tracking with `git rm --cached`, and assess a coordinated history purge if the file contains personal data. Any exposed credential should be rotated. History rewriting affects every clone and must not be done ad hoc.

For an existing private SQLite database:

```powershell
Copy-Item .env.example .env
# Put the private file at backend/smart_recruitment.db, or edit DATABASE_URL.
python scripts/check_schema.py
.\start_backend.ps1
```

If the file does not exist, startup fails without creating it. To create a brand-new empty development database intentionally:

```powershell
$env:DATABASE_ALLOW_CREATE = "true"
python -m alembic upgrade head
Remove-Item Env:DATABASE_ALLOW_CREATE
python scripts/check_schema.py
```

This creates schema only. It does not create users or seed demo data. Demo seed requires `ALLOW_DEMO_SEED=true` and must be used only with a disposable database.

For a pre-existing database created before CV Builder and without an `alembic_version` table, first create a verified backup, review the configured URL, and run `python scripts/check_schema.py --pre-cv-builder`. Only if that read-only check passes may an operator manually run `python -m alembic stamp 20261026_01`, followed by `python -m alembic upgrade head`. If `python -m alembic current` already reports a revision, do not stamp over it. Finish with `python scripts/check_schema.py`. See [CV Builder operations](CV_BUILDER.md) for the reviewed sequence.

## SQLite backup

The backup script uses SQLite's online backup API, opens the source read-only, creates a new timestamped file, and runs `PRAGMA integrity_check` on the result:

```powershell
python scripts/backup_sqlite.py
```

Backups go to ignored `backend/backups/`. Copy verified backups to encrypted storage with restricted access. The script never overwrites an existing backup.

This database backup does not include files under `uploads/`. Back up private
`uploads/cv_portraits/` separately to encrypted, access-controlled storage and
restore it together with the matching database snapshot.

## PostgreSQL-ready configuration

Install the optional driver and set credentials outside Git:

```powershell
pip install -r requirements-postgres.txt
$env:DATABASE_URL = "postgresql+psycopg://USER:PASSWORD@HOST:5432/DATABASE"
```

Use a secret manager or deployment environment variables for the actual URL, JWT secret, and admin seed values. No PostgreSQL URL or credential is supplied by this repository. For a new empty PostgreSQL database, review the migration and run `python -m alembic upgrade head` manually once; application startup never migrates it.

The mapped types are portable (`Integer`, `String`, `Text`, `Float`, `Boolean`, `DateTime`, foreign keys and unique constraints). The pending-interview partial unique index now has both SQLite and PostgreSQL predicates. The removed startup SQL was the only application-startup SQL specific to SQLite. `notifications.application_id` remains a nullable integer without a foreign key to match existing data; validate orphan values before adding that constraint in a later reviewed migration. Existing timestamps are timezone-naive and remain so during the first transfer to avoid changing stored values.

## SQLite to PostgreSQL cutover plan

No transfer should be run until a PostgreSQL server, private credentials, maintenance window, and rollback owner are available.

1. Stop writes to the shared backend and make an integrity-checked SQLite backup.
2. Record row counts and primary-key ranges for every table.
3. Create an empty PostgreSQL database and run the reviewed Alembic baseline.
4. In one controlled import, preserve primary keys and copy in dependency order: `users`, `companies`, `jobs`, `resumes`, `cv_drafts`, `cv_draft_exports`, `applications`, `application_status_history`, `interviews`, `interview_proposals`, `interview_time_options`, `notifications`, `evaluations`, `ai_feedback`.
5. Copy values exactly, including password hashes, roles, active flags, company ownership, CV text/metadata, scores, status history, interview data, notifications, AI feedback, and timestamps. Never re-hash passwords during transfer.
6. Advance each PostgreSQL integer sequence to the table's maximum ID.
7. Validate row counts, foreign-key orphans, unique constraints, status distributions, and representative records. Test login for admin, recruiter, and candidate plus ATS read/write flows against a staging backend.
8. Point one deployed backend at PostgreSQL, keep the SQLite backup read-only for rollback, then reopen writes. Frontends call only this backend; they never connect directly to the database.

Use a reviewed data-only importer or ETL job for step 4. Do not let a schema-conversion tool recreate tables independently of Alembic, and do not place exported personal data in the repository.

## Shared backend, frontend and CORS

Deploy one FastAPI service behind HTTPS and give every frontend the same API origin:

```dotenv
VITE_API_URL=https://api.example.invalid
```

Replace the placeholder with the real deployment URL. Configure `FRONTEND_ORIGIN` and/or JSON `ALLOWED_ORIGINS` in the backend with each exact trusted frontend origin. Do not use `*` while credentials are enabled.

## Shared CV files

The current `uploads/` directory, including private `cv_portraits/`, is node-local and is not suitable for multiple backend instances. Use a private S3-compatible object store (or an equivalent managed object store), server-side encryption, access logging, retention rules, malware scanning, and short-lived signed access. A later migration should add immutable object keys, sizes, content types, and checksums to stored files; keep original filenames only as display metadata. Choose the provider and credentials before implementing this migration. Existing `raw_text`, CV metadata, portrait checksums, and ownership remain in the database during the cutover; transfer normalized portrait objects separately and validate every referenced key.
