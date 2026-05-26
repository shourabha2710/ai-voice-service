import uuid
from datetime import datetime
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.video_generation import VideoGeneration


class VideoGenerationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: uuid.UUID,
        prompt: str,
        aspect_ratio: str = "16:9",
        duration: int = 16
    ) -> VideoGeneration:
        resolution = "720p"
        if aspect_ratio == "9:16":
            resolution = "720p"
        generation = VideoGeneration(
            user_id=user_id,
            prompt=prompt,
            status="pending",
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration,
            progress_percent=0,
        )
        self.session.add(generation)
        await self.session.flush()
        return generation

    async def get_by_id(self, generation_id: uuid.UUID) -> VideoGeneration | None:
        result = await self.session.execute(
            select(VideoGeneration).where(VideoGeneration.id == generation_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_and_user(
        self,
        generation_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> VideoGeneration | None:
        result = await self.session.execute(
            select(VideoGeneration).where(
                (VideoGeneration.id == generation_id) &
                (VideoGeneration.user_id == user_id)
            )
        )
        return result.scalar_one_or_none()

    async def get_user_generations(
        self,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 20,
        status: str | None = None
    ) -> tuple[list[VideoGeneration], int]:
        query = select(VideoGeneration).where(VideoGeneration.user_id == user_id)

        if status:
            if status == "active":
                query = query.where(
                    VideoGeneration.status.in_(["pending", "processing"])
                )
            else:
                query = query.where(VideoGeneration.status == status)

        count_result = await self.session.execute(
            select(func.count(VideoGeneration.id)).where(
                VideoGeneration.user_id == user_id
            )
        )
        total = count_result.scalar()

        query = query.order_by(desc(VideoGeneration.created_at))
        query = query.offset(skip).limit(limit)

        result = await self.session.execute(query)
        generations = result.scalars().all()

        return generations, total

    async def update_status(
        self,
        generation_id: uuid.UUID,
        status: str,
        video_path: str | None = None,
        thumbnail_path: str | None = None,
        duration_seconds: int | None = None,
        error_message: str | None = None,
    ) -> VideoGeneration | None:
        generation = await self.get_by_id(generation_id)
        if not generation:
            return None

        generation.status = status
        if video_path:
            generation.video_path = video_path
        if thumbnail_path:
            generation.thumbnail_path = thumbnail_path
        if duration_seconds is not None:
            generation.duration_seconds = duration_seconds
        if error_message:
            generation.error_message = error_message
        if status == "completed":
            generation.completed_at = datetime.utcnow()

        self.session.add(generation)
        await self.session.flush()
        return generation

    async def update_progress(
        self,
        generation_id: uuid.UUID,
        progress_percent: int,
    ) -> VideoGeneration | None:
        generation = await self.get_by_id(generation_id)
        if not generation:
            return None

        generation.progress_percent = progress_percent
        if progress_percent == 100:
            generation.status = "completed"
            generation.completed_at = datetime.utcnow()

        self.session.add(generation)
        await self.session.flush()
        return generation

    async def delete_by_id_and_user(
        self,
        generation_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> bool:
        generation = await self.get_by_id_and_user(generation_id, user_id)
        if not generation:
            return False

        await self.session.delete(generation)
        await self.session.flush()
        return True
