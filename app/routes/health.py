from fastapi import APIRouter
from app.models.tts import HealthResponse
from app.config.settings import settings

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Check service health status.
    """
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        service=settings.APP_NAME
    )
