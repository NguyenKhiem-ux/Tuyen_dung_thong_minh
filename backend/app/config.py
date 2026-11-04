from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "smart_recruitment.db"


class Settings(BaseSettings):
    DATABASE_URL: str = f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"
    DATABASE_ALLOW_CREATE: bool = False
    SECRET_KEY: str = "change-this-secret-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    UPLOAD_DIR: str = str(BACKEND_DIR / "uploads")
    MAX_UPLOAD_MB: int = 8
    FRONTEND_ORIGIN: str = "http://127.0.0.1:5173"
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    ADMIN_EMAIL: str = "admin@smartrecruit.ai"
    ADMIN_PASSWORD: str = "Admin@123"
    AI_WEIGHTS: str = ""
    AI_OCR: bool = True
    AI_OCR_LANGS: str = "eng+vie"
    AI_RECOMMENDATION_CANDIDATE_LIMIT: int = Field(default=20, ge=1, le=100)
    ALLOW_DEMO_SEED: bool = False

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("UPLOAD_DIR")
    @classmethod
    def resolve_upload_dir(cls, value: str) -> str:
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = BACKEND_DIR / path
        return str(path.resolve())

    @property
    def cors_origins(self) -> list[str]:
        return list(dict.fromkeys([self.FRONTEND_ORIGIN, *self.ALLOWED_ORIGINS]))


settings = Settings()

MAX_UPLOAD_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024
