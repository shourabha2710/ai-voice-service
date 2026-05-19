from typing import Optional, Sequence, Dict, Any
import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.audio import AudioGeneration
from app.db.repositories.base import BaseRepository

class AudioGenerationRepository(BaseRepository[AudioGeneration]):
    def __init__(self, db: AsyncSession):
        super().__init__(AudioGeneration, db)

    async def get_by_job_id(self, job_id: str) -> Optional[AudioGeneration]:
        result = await self.db.execute(select(AudioGeneration).filter(AudioGeneration.job_id == job_id))
        return result.scalar_one_or_none()

    async def get_by_user_id(
        self, 
        user_id: uuid.UUID, 
        skip: int = 0, 
        limit: int = 100, 
        status: Optional[str] = None
    ) -> Sequence[AudioGeneration]:
        query = select(AudioGeneration).filter(AudioGeneration.user_id == user_id)
        if status:
            query = query.filter(AudioGeneration.status == status)
            
        result = await self.db.execute(
            query
            .offset(skip)
            .limit(limit)
            .order_by(AudioGeneration.created_at.desc())
        )
        return result.scalars().all()

    async def get_stats_by_user_id(self, user_id: uuid.UUID) -> Dict[str, Any]:
        # Count totals
        total_result = await self.db.execute(
            select(func.count(AudioGeneration.id))
            .filter(AudioGeneration.user_id == user_id)
        )
        total_generations = total_result.scalar() or 0
        
        # Count completed
        completed_result = await self.db.execute(
            select(func.count(AudioGeneration.id))
            .filter(AudioGeneration.user_id == user_id, AudioGeneration.status == "completed")
        )
        completed = completed_result.scalar() or 0
        
        # Count failed
        failed_result = await self.db.execute(
            select(func.count(AudioGeneration.id))
            .filter(AudioGeneration.user_id == user_id, AudioGeneration.status == "failed")
        )
        failed = failed_result.scalar() or 0
        
        # Sum total characters processed
        chars_result = await self.db.execute(
            select(func.sum(AudioGeneration.text_length))
            .filter(AudioGeneration.user_id == user_id, AudioGeneration.status == "completed")
        )
        total_characters = chars_result.scalar() or 0

        return {
            "total_generations": total_generations,
            "completed": completed,
            "failed": failed,
            "total_characters_processed": total_characters
        }
