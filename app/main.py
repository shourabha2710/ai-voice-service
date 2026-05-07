import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.config.settings import settings
from app.services.cleanup_service import cleanup_service
from app.utils.logger import setup_logging

# Setup logging
setup_logging(settings.log_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"sys.path: {sys.path}")
    logger.info("Application starting up...")

    # Validate FFmpeg
    if not settings.get_ffmpeg_path():
        logger.error(
            "FFmpeg not found! Audio merging will fail. Please install ffmpeg."
        )
    else:
        logger.info("FFmpeg validated successfully.")

    # Ensure directories exist
    settings.audio_path.mkdir(parents=True, exist_ok=True)
    settings.temp_path.mkdir(parents=True, exist_ok=True)
    settings.log_path.mkdir(parents=True, exist_ok=True)

    # Start cleanup background task
    cleanup_task = asyncio.create_task(cleanup_service.start())

    yield

    # Shutdown
    logger.info("Application shutting down...")

    await cleanup_service.stop()

    cleanup_task.cancel()

    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("Cleanup task cancelled successfully.")

    logger.info("Shutdown complete.")


# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="A production-ready Text-to-Speech service using edge-tts and FastAPI.",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time

    start_time = time.time()

    response = await call_next(request)

    process_time = (time.time() - start_time) * 1000

    logger.info(
        f"Method: {request.method} | "
        f"Path: {request.url.path} | "
        f"Status: {response.status_code} | "
        f"Time: {process_time:.2f}ms"
    )

    return response


# Global Exception Handler
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


# Include Routes
from app.routes import health, tts

app.include_router(health.router)
app.include_router(tts.router)


# Local Development Entry Point
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )