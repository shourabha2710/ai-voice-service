from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime
import uuid
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.db.models.user import User
from app.db.session import get_db
from app.db.repositories.audio import AudioGenerationRepository

router = APIRouter(prefix="/api/v1/generations", tags=["generations"])

class GenerationResponse(BaseModel):
    id: uuid.UUID
    job_id: str
    type: str
    status: str
    voice: str
    text_length: int
    audio_path: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class GenerationStatsResponse(BaseModel):
    total_generations: int
    completed: int
    failed: int
    total_characters_processed: int

@router.get("/me", response_model=List[GenerationResponse], summary="Get My Generations")
async def get_my_generations(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get paginated and filtered history of the current user's audio generations, ordered by newest first.
    """
    repo = AudioGenerationRepository(db)
    generations = await repo.get_by_user_id(
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        status=status
    )
    return generations

@router.get("/stats", response_model=GenerationStatsResponse, summary="Get My Generation Stats")
async def get_my_generation_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get generation statistics for the current user.
    """
    repo = AudioGenerationRepository(db)
    stats = await repo.get_stats_by_user_id(current_user.id)
    return stats
