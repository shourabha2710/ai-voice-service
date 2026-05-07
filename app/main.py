import asyncio
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from contextlib import asynccontextmanager

from app.config.settings import settings
from app.utils.logger import setup_logging
from app.services.cleanup_service import cleanup_service

# Setup logging
setup_logging(settings.log_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"sys.path: {sys.path}")
    logger.info("Application starting up...")
    
    # 1. Validate FFmpeg
    if not settings.get_ffmpeg_path():
        logger.error("FFmpeg not found! Audio merging will fail. Please install ffmpeg.")
    else:
        logger.info("FFmpeg validated successfully.")
    
    # 2. Ensure directories exist
    settings.audio_path.mkdir(parents=True, exist_ok=True)
    settings.temp_path.mkdir(parents=True, exist_ok=True)
    settings.log_path.mkdir(parents=True, exist_ok=True)
    
    # 3. Start cleanup background task
    cleanup_task = asyncio.create_task(cleanup_service.start())
    
    yield
    
    # Shutdown
    logger.info("Application shutting down...")
    await cleanup_service.stop()
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("Shutdown complete.")

# Initialize app with lifespan
app = FastAPI(
    title=settings.APP_NAME,
    description="A production-ready Text-to-Speech service using edge-tts and FastAPI.",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    formatted_process_time = "{0:.2f}ms".format(process_time)
    logger.info(
        f"Method: {request.method} | "
        f"Path: {request.url.path} | "
        f"Status: {response.status_code} | "
        f"Time: {formatted_process_time}"
    )
    return response

# Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "message": "An internal error occurred"}
    )

# Include Routes
from app.routes import tts, health
app.include_router(health.router)
app.include_router(tts.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    formatted_process_time = "{0:.2f}ms".format(process_time)
    logger.info(
        f"Method: {request.method} | "
        f"Path: {request.url.path} | "
        f"Status: {response.status_code} | "
        f"Time: {formatted_process_time}"
    )
    return response

# Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "message": "An internal error occurred"}
    )

# Include Routes
from app.routes import tts, health
app.include_router(health.router)
app.include_router(tts.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
