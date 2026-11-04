"""Add private portrait metadata to structured CV drafts.

Revision ID: 20261027_03
Revises: 20261027_02
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20261027_03"
down_revision = "20261027_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cv_drafts", sa.Column("portrait_filename", sa.String(255), nullable=True))
    op.add_column("cv_drafts", sa.Column("portrait_mime", sa.String(50), nullable=True))
    op.add_column("cv_drafts", sa.Column("portrait_sha256", sa.String(64), nullable=True))


def downgrade() -> None:
    raise RuntimeError("CV portrait downgrade could orphan private files and is intentionally disabled.")
