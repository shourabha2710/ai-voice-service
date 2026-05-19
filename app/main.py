import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", message=".*ffmpeg.*", category=RuntimeWarning)

try:
    import pydub.utils
    def _patched_get_encoder_name():
        return "ffmpeg"
    pydub.utils.get_encoder_name = _patched_get_encoder_name
except Exception:
    pass

import asyncio
import sys
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from app.config.settings import settings

_ffmpeg_path = settings.get_ffmpeg_path()
if _ffmpeg_path:
    _ffmpeg_dir = os.path.dirname(_ffmpeg_path)
    _ffmpeg_exe = os.path.join(_ffmpeg_dir, "ffmpeg.exe")
    if not os.path.exists(_ffmpeg_exe):
        try:
            import shutil
            shutil.copy2(_ffmpeg_path, _ffmpeg_exe)
        except Exception:
            pass
    if _ffmpeg_dir and _ffmpeg_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

from app.services.cleanup_service import cleanup_service
from app.utils.logger import setup_logging

setup_logging(settings.log_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"sys.path: {sys.path}")
    logger.info("Application starting up...")

    if not settings.get_ffmpeg_path():
        logger.error(
            "FFmpeg not found! Audio merging will fail. Please install ffmpeg."
        )
    else:
        logger.info("FFmpeg validated successfully.")

    # Database startup validation
    from app.db.session import validate_db_connection
    db_ok = await validate_db_connection()
    if not db_ok:
        logger.error("CRITICAL: Database connection validation failed during startup!")
    else:
        logger.info("Database connection validated successfully during startup.")

    settings.audio_path.mkdir(parents=True, exist_ok=True)
    settings.temp_path.mkdir(parents=True, exist_ok=True)
    settings.log_path.mkdir(parents=True, exist_ok=True)

    cleanup_task = asyncio.create_task(cleanup_service.start())

    yield

    logger.info("Application shutting down...")

    await cleanup_service.stop()

    cleanup_task.cancel()

    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("Cleanup task cancelled successfully.")

    logger.info("Shutdown complete.")


app = FastAPI(
    title=settings.APP_NAME,
    description="A production-ready Text-to-Speech service using edge-tts and FastAPI.",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    import time

    start_time = time.time()

    response = await call_next(request)

    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    process_time = (time.time() - start_time) * 1000

    logger.info(
        f"Method: {request.method} | "
        f"Path: {request.url.path} | "
        f"Status: {response.status_code} | "
        f"Time: {process_time:.2f}ms"
    )

    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {str(exc)}")

    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "message": "An internal server error occurred.",
        },
    )


# Serve static frontend
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def serve_frontend():
    return FileResponse(str(STATIC_DIR / "index.html"))


# Include Routes
from app.routes import health, tts, auth, generations

app.include_router(health.router)
app.include_router(tts.router)
app.include_router(auth.router)
app.include_router(generations.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
