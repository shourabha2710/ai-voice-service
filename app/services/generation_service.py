import uuid
from typing import Optional
from fastapi import HTTPException, status
from loguru import logger

from app.db.models.audio import AudioGeneration
from app.db.repositories.audio import AudioGenerationRepository


def validate_generation_ownership(
    generation: Optional[AudioGeneration],
    user_id: uuid.UUID,
) -> AudioGeneration:
    """Validate that the generation belongs to the current authenticated user."""
    if generation is None:
        logger.warning(f"Invalid ownership check: generation not found for user_id={user_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Generation not found",
        )
    if generation.user_id != user_id:
        logger.warning(
            f"Unauthorized access attempt to generation {generation.job_id} by user_id={user_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Generation not found",
        )
    return generation


async def get_generation_for_user(
    repo: AudioGenerationRepository,
    job_id: str,
    user_id: uuid.UUID,
) -> AudioGeneration:
    generation = await repo.get_generation_for_user(job_id=job_id, user_id=user_id)
    return validate_generation_ownership(generation, user_id)
