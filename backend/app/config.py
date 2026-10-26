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
    # Engine AI. AI_WEIGHTS = "kỹ năng,kinh nghiệm,ngữ nghĩa,dự án" (ví dụ "0.4,0.25,0.2,0.15"); để trống = mặc định.
    AI_WEIGHTS: str = ""
    AI_OCR: bool = True  # tự đọc CV dạng ảnh/scan bằng Tesseract nếu máy có cài
    AI_OCR_LANGS: str = "eng+vie"

    class Config:
        env_file = ".env"


settings = Settings()

MAX_UPLOAD_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024
