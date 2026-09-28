from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import api
from .database import Base, engine
from . import models  # noqa: F401  (ensure models are registered before create_all)
from .config import settings

Base.metadata.create_all(bind=engine)

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
    allow_origins=settings.ALLOWED_ORIGINS,
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
