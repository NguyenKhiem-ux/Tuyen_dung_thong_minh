"""Add structured CV drafts, idempotent exports and active resume selection.

Revision ID: 20261027_02
Revises: 20261026_01
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20261027_02"
down_revision = "20261026_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("active_resume_id", sa.Integer(), nullable=True))
    op.create_table(
        "cv_drafts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("candidate_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("template_key", sa.String(30), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_cv_drafts_candidate_id", "cv_drafts", ["candidate_id"], unique=False)
    op.create_table(
        "cv_draft_exports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("draft_id", sa.Integer(), sa.ForeignKey("cv_drafts.id"), nullable=False),
        sa.Column("resume_id", sa.Integer(), sa.ForeignKey("resumes.id"), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("draft_id", "content_hash", name="uq_cv_draft_export_content"),
        sa.UniqueConstraint("resume_id", name="uq_cv_draft_export_resume"),
    )
    op.create_index("ix_cv_draft_exports_draft_id", "cv_draft_exports", ["draft_id"], unique=False)


def downgrade() -> None:
    raise RuntimeError("CV Builder downgrade would delete drafts and is intentionally disabled.")
