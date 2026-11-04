from pathlib import Path

from sqlalchemy import MetaData, UniqueConstraint, create_engine, inspect
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import BACKEND_DIR, settings


def resolve_database_url(database_url: str) -> URL:
    """Resolve relative SQLite files against backend/, never the process cwd."""
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        return url

    path = Path(url.database).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return url.set(database=path.resolve().as_posix())


def sqlite_database_path(database_url: str | URL) -> Path | None:
    url = resolve_database_url(database_url) if isinstance(database_url, str) else database_url
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        return None
    return Path(url.database)


database_url = resolve_database_url(settings.DATABASE_URL)
database_path = sqlite_database_path(database_url)
if database_path is not None and not database_path.is_file() and not settings.DATABASE_ALLOW_CREATE:
    raise RuntimeError(
        f"SQLite database does not exist: {database_path}. Startup was stopped before SQLite could create an "
        "empty file. Restore the intended database, set DATABASE_URL correctly, or explicitly initialize a new "
        "database with DATABASE_ALLOW_CREATE=true and Alembic."
    )

connect_args = {"check_same_thread": False} if database_url.get_backend_name() == "sqlite" else {}
engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def assert_schema_current(
    metadata: MetaData,
    *,
    ignored_tables: set[str] | None = None,
    ignored_columns: dict[str, set[str]] | None = None,
) -> None:
    """Read-only startup guard: reject an empty or outdated database."""
    ignored_tables = ignored_tables or set()
    ignored_columns = ignored_columns or {}
    inspector = inspect(engine)
    actual_tables = set(inspector.get_table_names())
    expected_tables = set(metadata.tables) - ignored_tables
    problems = []
    if missing_tables := expected_tables - actual_tables:
        problems.append(f"missing tables: {', '.join(sorted(missing_tables))}")

    for table_name in sorted(expected_tables & actual_tables):
        table = metadata.tables[table_name]
        expected_columns = set(table.columns.keys()) - ignored_columns.get(table_name, set())
        actual_columns = {column["name"] for column in inspector.get_columns(table_name)}
        if missing_columns := expected_columns - actual_columns:
            problems.append(f"{table_name} missing columns: {', '.join(sorted(missing_columns))}")

        expected_indexes = {index.name for index in table.indexes if index.name}
        actual_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
        if missing_indexes := expected_indexes - actual_indexes:
            problems.append(f"{table_name} missing indexes: {', '.join(sorted(missing_indexes))}")

        expected_uniques = {
            constraint.name
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint) and constraint.name
        }
        actual_uniques = {
            constraint["name"] for constraint in inspector.get_unique_constraints(table_name) if constraint["name"]
        }
        if missing_uniques := expected_uniques - actual_uniques:
            problems.append(f"{table_name} missing unique constraints: {', '.join(sorted(missing_uniques))}")

    if problems:
        raise RuntimeError(
            "Database schema is not current; startup will not modify it. "
            + "; ".join(problems)
            + ". Back up the database, then run the reviewed Alembic migration manually."
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
