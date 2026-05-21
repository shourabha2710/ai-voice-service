import uuid
from datetime import datetime
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.image import ImageGeneration


class ImageGenerationRepository:
    """Repository for image generation database operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: uuid.UUID,
        prompt: str,
        provider: str = "stable-diffusion-v1-5"
    ) -> ImageGeneration:
        """Create a new pending image generation record."""
        generation = ImageGeneration(
            user_id=user_id,
            prompt=prompt,
            status="pending",
            provider=provider
        )
        self.session.add(generation)
        await self.session.flush()
        return generation

    async def get_by_id(self, generation_id: uuid.UUID) -> ImageGeneration | None:
        """Get image generation by ID."""
        result = await self.session.execute(
            select(ImageGeneration).where(ImageGeneration.id == generation_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_and_user(
        self,
        generation_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> ImageGeneration | None:
        """Get image generation by ID, ensuring it belongs to the user."""
        result = await self.session.execute(
            select(ImageGeneration).where(
                (ImageGeneration.id == generation_id) &
                (ImageGeneration.user_id == user_id)
            )
        )
        return result.scalar_one_or_none()

    async def get_user_generations(
        self,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 20,
        status: str | None = None
    ) -> tuple[list[ImageGeneration], int]:
        """Get paginated image generations for a user."""
        query = select(ImageGeneration).where(ImageGeneration.user_id == user_id)

        if status:
            query = query.where(ImageGeneration.status == status)

        # Get total count
        count_result = await self.session.execute(
            select(func.count(ImageGeneration.id)).where(
                ImageGeneration.user_id == user_id
            )
        )
        total = count_result.scalar()

        # Get paginated results, ordered by newest first
        query = query.order_by(desc(ImageGeneration.created_at))
        query = query.offset(skip).limit(limit)

        result = await self.session.execute(query)
        generations = result.scalars().all()

        return generations, total

    async def update_status(
        self,
        generation_id: uuid.UUID,
        status: str,
        image_path: str | None = None,
        generation_time_seconds: float | None = None,
        error_message: str | None = None
    ) -> ImageGeneration | None:
        """Update generation status and metadata."""
        generation = await self.get_by_id(generation_id)
        if not generation:
            return None

        generation.status = status
        if image_path:
            generation.image_path = image_path
        if generation_time_seconds is not None:
            generation.generation_time_seconds = generation_time_seconds
        if error_message:
            generation.error_message = error_message
        if status == "completed":
            generation.completed_at = datetime.utcnow()

        self.session.add(generation)
        await self.session.flush()
        return generation

    async def delete_by_id_and_user(
        self,
        generation_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> bool:
        """Delete image generation if it belongs to the user."""
        generation = await self.get_by_id_and_user(generation_id, user_id)
        if not generation:
            return False

        await self.session.delete(generation)
        await self.session.flush()
        return True
