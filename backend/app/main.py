import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from app.routers.session import router as session_router
from app.routers.tts import router as tts_router
from app.routers.avatar import router as avatar_router
from app.routers.auth import router as auth_router
from app.services.llm_service import LLMServiceError

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-30s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)

# ── App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Study Group Brain",
    description="Multi-agent AI study group backend powered by Ollama",
    version="0.3.0",
)

# ── CORS ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Routers ──────────────────────────────────────────────────────
app.include_router(session_router)
app.include_router(tts_router)
app.include_router(avatar_router)
app.include_router(auth_router)


# ── Exception Handlers ──────────────────────────────────────────────
@app.exception_handler(LLMServiceError)
async def llm_error_handler(request, exc: LLMServiceError):
    return JSONResponse(
        status_code=503,
        content={"error": "llm_unavailable", "detail": str(exc)},
    )


# ── Health ───────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "AI Study Group Brain", "version": "0.3.0"}


# ── Frontend ─────────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/auth.html")
    async def serve_auth():
        return FileResponse(str(FRONTEND_DIR / "auth.html"))

    @app.get("/lobby.html")
    async def serve_lobby():
        return FileResponse(str(FRONTEND_DIR / "lobby.html"))