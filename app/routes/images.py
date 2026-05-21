import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.db.models.user import User
from app.db.repositories.image import ImageGenerationRepository
from app.schemas.image import (
    ImageGenerationRequest,
    ImageGenerationResponse,
    ImageHistoryResponse,
    ImageDetailResponse,
)
from app.services.image_service import image_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/images", tags=["images"])


@router.post("/generate", response_model=ImageGenerationResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_image(
    request: ImageGenerationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """
    Generate an image from a text prompt.

    Returns immediately with a pending record.
    Image generation happens in the background.
    """
    logger.info(f"POST /generate hit — user={current_user.id} prompt='{request.prompt[:80]}...'")

    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        # Create pending generation record
        repo = ImageGenerationRepository(db)
        generation = await repo.create(
            user_id=current_user.id,
            prompt=request.prompt,
            provider="stable-diffusion-v1-5"
        )
        await db.commit()
        logger.info(f"Generation record created: {generation.id}")

        # Schedule background generation
        background_tasks.add_task(
            _generate_image_background,
            generation_id=generation.id,
            prompt=request.prompt,
        )

        logger.info(f"Background task scheduled for generation: {generation.id}")
        logger.info(f"Image generation queued for user {current_user.id}: {generation.id}")

        return ImageGenerationResponse.from_orm(generation)

    except Exception as e:
        logger.error(f"Error creating image generation record: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create generation record"
        )


@router.get("/history", response_model=ImageHistoryResponse)
async def get_image_history(
    skip: int = 0,
    limit: int = 20,
    status_filter: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get paginated image generation history for the current user.

    Only returns images created by the authenticated user.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = ImageGenerationRepository(db)
        generations, total = await repo.get_user_generations(
            user_id=current_user.id,
            skip=skip,
            limit=limit,
            status=status_filter
        )

        return ImageHistoryResponse(
            items=[ImageGenerationResponse.from_orm(g) for g in generations],
            total=total,
            page=skip // limit,
            page_size=limit,
        )

    except Exception as e:
        logger.error(f"Error fetching image history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch image history"
        )


@router.get("/{generation_id}", response_model=ImageDetailResponse)
async def get_image_detail(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get details of a specific image generation.

    Only the owner can access their image.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = ImageGenerationRepository(db)
        generation = await repo.get_by_id_and_user(generation_id, current_user.id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image generation not found"
            )

        response = ImageDetailResponse.from_orm(generation)
        
        # Add image URL if image exists
        if generation.image_path:
            response.image_url = f"/api/v1/images/{generation.id}/file"

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching image detail: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch image details"
        )


@router.delete("/{generation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete an image generation record.

    Only the owner can delete their image.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = ImageGenerationRepository(db)
        deleted = await repo.delete_by_id_and_user(generation_id, current_user.id)

        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image generation not found"
            )

        await db.commit()
        logger.info(f"Image generation deleted: {generation_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting image: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete image"
        )


@router.get("/{generation_id}/file")
async def get_image_file(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download the generated image file.

    Only the owner can download their image.
    Serves image safely from the storage directory.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = ImageGenerationRepository(db)
        generation = await repo.get_by_id_and_user(generation_id, current_user.id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image generation not found"
            )

        if generation.status != "completed" or not generation.image_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not ready or not available"
            )

        # Safely construct file path - never trust user input
        file_path = Path(generation.image_path)
        
        # Security: ensure the file is in the expected directory
        if not file_path.parts[0] == "storage" or not file_path.parts[1] == "generated-images":
            logger.error(f"Security: Invalid image path attempted: {generation.image_path}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

        # Verify file exists
        if not file_path.exists():
            logger.error(f"Image file not found: {file_path}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image file not found on disk"
            )

        return FileResponse(
            file_path,
            media_type="image/png",
            filename=f"generated-image-{generation_id}.png"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving image file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to serve image"
        )


async def _generate_image_background(generation_id: uuid.UUID, prompt: str) -> None:
    """
    Background task to generate image.
    This runs asynchronously after the HTTP response is sent.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.config.settings import settings
    from app.db.session import get_encoded_db_url

    logger.info(f"Background task STARTED for generation: {generation_id}")

    # Use the same URL-encoding as the main session to handle special chars in password
    encoded_url = get_encoded_db_url(settings.DATABASE_URL)
    engine = create_async_engine(
        encoded_url,
        echo=False,
        future=True,
    )
    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as db:
        try:
            repo = ImageGenerationRepository(db)
            generation = await repo.get_by_id(generation_id)

            if not generation:
                logger.error(f"Generation record not found: {generation_id}")
                return

            try:
                # Ensure service is initialized
                if image_service._pipeline is None:
                    logger.info(f"Initializing image service for generation: {generation_id}")
                    await image_service.initialize()

                # Generate the image
                logger.info(f"Starting image generation: {generation_id}")
                image, generation_time = await image_service.generate_image(prompt)

                # Save image to storage
                image_path = image_service.save_image(image, generation_id)

                # Update database record
                await repo.update_status(
                    generation_id,
                    status="completed",
                    image_path=image_path,
                    generation_time_seconds=generation_time,
                )

                await db.commit()
                logger.info(f"Image generation COMPLETED: {generation_id} ({generation_time:.2f}s)")

            except Exception as e:
                logger.error(f"Image generation FAILED: {generation_id} — {e}")
                error_message = str(e)[:1024]  # Truncate to fit in DB
                await repo.update_status(
                    generation_id,
                    status="failed",
                    error_message=error_message,
                )
                await db.commit()

        except Exception as e:
            logger.error(f"Background task FATAL error for {generation_id}: {e}")
            await db.rollback()
