# CV Builder operations

## Database migration

Application startup never creates or migrates tables. Before enabling CV Builder on an existing database:

```powershell
cd backend
python scripts\backup_sqlite.py
python -m alembic current
```

Review `DATABASE_URL` and the verified backup path. Then use exactly one path:

- If `alembic current` reports `20261026_01`, run `python -m alembic upgrade head`.
- If the database predates Alembic and reports no revision, first run the read-only check `python scripts\check_schema.py --pre-cv-builder`. Only when it passes, run `python -m alembic stamp 20261026_01`, then `python -m alembic upgrade head`.
- If another revision or any schema error is reported, stop and review the database; do not force a stamp.

Finally run:

```powershell
python scripts\check_schema.py
.\start_backend.ps1
```

Revision `20261027_02` adds nullable `users.active_resume_id` plus new `cv_drafts` and `cv_draft_exports` tables. Revision `20261027_03` adds nullable portrait metadata to `cv_drafts`; existing drafts therefore continue to work without an image. Neither revision updates or deletes existing users, resumes, applications, ATS history, interviews, notifications, or AI feedback. Destructive downgrade is intentionally disabled.

## API

- `POST/GET /api/resume-drafts`
- `GET/PUT/DELETE /api/resume-drafts/{draft_id}`
- `POST /api/resume-drafts/{draft_id}/save-to-resumes`
- `POST/GET/DELETE /api/resume-drafts/{draft_id}/portrait`
- `PUT /api/resumes/{resume_id}/activate`
- `POST /api/jobs/{job_id}/apply?resume_id={resume_id}` (optional; otherwise uses the active CV)

All endpoints use the existing JWT candidate role guard. Draft and portrait reads/writes are scoped to the authenticated candidate. Portraits are normalized to metadata-free 800×800 JPEG files under the private backend upload directory; the stored filename is never returned to the frontend. They must not be exposed through a public static-file mount.

## Manual smoke test

1. Log in as a Candidate and open **CV của tôi → Tạo CV trực tuyến**.
2. Fill Vietnamese personal data; upload a horizontal or vertical JPG/PNG/WebP portrait, adjust the 1:1 crop, and add/remove education, experience, project, award, and certificate entries. Confirm the A4 preview updates and blank entries remain hidden.
3. Save the draft, leave the tab, return, and reload it from the draft selector.
4. Export PDF. Check A4 size, circular undistorted portrait, multiple-page output for long content, and that Vietnamese text can be selected/copied.
5. Select **Lưu vào CV của tôi** twice without changing the draft. Confirm only one resume appears and it is marked **Đang sử dụng**.
6. Apply to an open job. Confirm the application references that resume, AI scores are present, and Recruiter ATS/Admin/notifications continue to load.

The bundled Noto Sans files are covered by `frontend/public/fonts/LICENSE.txt`. Generated PDFs are sent through the existing upload text-extraction and AI pipeline; a failed export leaves the structured draft unchanged. The export identity hash includes the normalized portrait checksum, so replacing/removing an image creates a new Resume export instead of reusing an older PDF.
