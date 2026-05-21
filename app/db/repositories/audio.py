from typing import Any, Optional, Sequence, Dict
import uuid
from datetime import datetime
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

    async def get_generation_for_user(self, job_id: str, user_id: uuid.UUID) -> Optional[AudioGeneration]:
        result = await self.db.execute(
            select(AudioGeneration)
            .filter(AudioGeneration.job_id == job_id, AudioGeneration.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_generation(
        self,
        user_id: uuid.UUID,
        job_id: str,
        type: str,
        status: str,
        voice: str,
        text_length: int,
        audio_path: Optional[str] = None,
        completed_at: Optional[datetime] = None,
    ) -> AudioGeneration:
        return await self.create(
            user_id=user_id,
            job_id=job_id,
            type=type,
            status=status,
            voice=voice,
            text_length=text_length,
            audio_path=audio_path,
            completed_at=completed_at,
        )

    async def update_generation_status(
        self,
        job_id: str,
        status: str,
        audio_path: Optional[str] = None,
        completed_at: Optional[Any] = None,
    ) -> Optional[AudioGeneration]:
        generation = await self.get_by_job_id(job_id)
        if not generation:
            return None

        generation.status = status
        if audio_path is not None:
            generation.audio_path = audio_path
        if completed_at is not None:
            generation.completed_at = completed_at

        self.db.add(generation)
        await self.db.commit()
        await self.db.refresh(generation)
        return generation

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

    async def count_by_user_id(
        self,
        user_id: uuid.UUID,
        status: Optional[str] = None
    ) -> int:
        query = select(func.count(AudioGeneration.id)).filter(AudioGeneration.user_id == user_id)
        if status:
            query = query.filter(AudioGeneration.status == status)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_user_generations(
        self,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None
    ) -> Sequence[AudioGeneration]:
        return await self.get_by_user_id(user_id=user_id, skip=skip, limit=limit, status=status)

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
