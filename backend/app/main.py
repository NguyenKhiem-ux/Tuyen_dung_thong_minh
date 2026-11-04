from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import api
from .database import Base, assert_schema_current
from . import models  # noqa: F401  (register models before the read-only schema check)
from .config import settings

assert_schema_current(Base.metadata)

app = FastAPI(
    title="Smart Recruitment AI",
    description="Hệ thống tuyển dụng thông minh ứng dụng trí tuệ nhân tạo (AI CV matching, ranking, recommendation)",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# =========================
# CORS — configured for localhost dev origins
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# API ROUTER
# =========================
# routers.py already defines: api = APIRouter(prefix="/api")
app.include_router(api)


# =========================
# ROOT
# =========================
@app.get("/", tags=["default"])
def root():
    return {
        "message": "Smart Recruitment AI API is running",
        "version": "2.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/health",
    }


# =========================
# HEALTH CHECK
# =========================
@app.get("/health", tags=["default"])
def health_check():
    return {"status": "ok", "service": "smart-recruitment-ai"}
