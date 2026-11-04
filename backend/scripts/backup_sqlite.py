"""Create a transactionally consistent SQLite backup without changing the source."""

import argparse
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", help="SQLite URL; defaults to DATABASE_URL/backend .env")
    parser.add_argument("--output-dir", type=Path, default=BACKEND_DIR / "backups")
    return parser.parse_args()


def backup(source: Path, output_dir: Path) -> Path:
    source = source.resolve()
    if not source.is_file():
        raise FileNotFoundError(f"SQLite database does not exist: {source}")

    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    target = output_dir.resolve() / f"{source.stem}-{timestamp}.sqlite3"
    if target.exists():
        raise FileExistsError(f"Backup target already exists: {target}")

    source_connection = sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True)
    target_connection = sqlite3.connect(target)
    try:
        source_connection.backup(target_connection)
        result = target_connection.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise RuntimeError(f"Backup integrity check failed: {result}")
    except Exception:
        target_connection.close()
        source_connection.close()
        target.unlink(missing_ok=True)
        raise
    else:
        target_connection.close()
        source_connection.close()
    return target


def main() -> None:
    args = parse_args()
    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    from app.config import settings
    from app.database import resolve_database_url, sqlite_database_path

    database_url = resolve_database_url(args.database_url or settings.DATABASE_URL)
    source = sqlite_database_path(database_url)
    if source is None:
        raise RuntimeError("backup_sqlite.py only supports a file-based SQLite DATABASE_URL")
    target = backup(source, args.output_dir)
    print(f"Backup created and verified: {target}")


if __name__ == "__main__":
    main()
