"""Validate the configured database schema without modifying it."""

import argparse
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import models  # noqa: E402,F401
from app.database import Base, assert_schema_current  # noqa: E402


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pre-cv-builder",
        action="store_true",
        help="Validate the 20261026_01 schema before stamping and applying the CV Builder migration.",
    )
    args = parser.parse_args()
    if args.pre_cv_builder:
        assert_schema_current(
            Base.metadata,
            ignored_tables={"cv_drafts", "cv_draft_exports"},
            ignored_columns={"users": {"active_resume_id"}},
        )
        print("Database matches the pre-CV-Builder baseline.")
    else:
        assert_schema_current(Base.metadata)
        print("Database schema is current.")
