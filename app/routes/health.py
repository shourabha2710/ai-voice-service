from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from loguru import logger
from app.models.tts import HealthResponse
from app.config.settings import settings
from app.db.session import get_db

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Check service health status, including live database connection validation.
    """
    try:
        # Validate database connectivity by executing a lightweight query
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"Service unhealthy: Database connection failure: {str(e)}"
        )

    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        service=settings.APP_NAME
    )
