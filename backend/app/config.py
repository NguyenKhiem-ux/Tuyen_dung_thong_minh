from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./smart_recruitment.db"
    SECRET_KEY: str = "change-this-secret-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    UPLOAD_DIR: str = "uploads"
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

    class Config:
        env_file = ".env"


settings = Settings()

MAX_UPLOAD_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024
