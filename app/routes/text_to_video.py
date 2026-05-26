import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.db.models.user import User
from app.db.repositories.video_generation import VideoGenerationRepository
from app.schemas.text_to_video import (
    TextToVideoRequest,
    TextToVideoResponse,
    TextToVideoHistoryResponse,
    TextToVideoDetailResponse,
)
from app.services.video_generation_service import video_generation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/text-to-video", tags=["text-to-video"])


@router.post("/generate", response_model=TextToVideoResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_video(
    request: TextToVideoRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = VideoGenerationRepository(db)
        generation = await repo.create(
            user_id=current_user.id,
            prompt=request.prompt,
            aspect_ratio=request.aspect_ratio,
            duration=request.duration,
        )
        await db.commit()
        logger.info(f"Video generation record created: {generation.id}")

        background_tasks.add_task(
            _generate_video_background,
            generation_id=generation.id,
            prompt=request.prompt,
            duration=request.duration,
            aspect_ratio=request.aspect_ratio,
            quality=request.quality,
        )

        return TextToVideoResponse.from_orm(generation)

    except Exception as e:
        logger.error(f"Error creating video generation record: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create generation record"
        )


@router.get("/me", response_model=TextToVideoHistoryResponse)
async def get_video_history(
    skip: int = 0,
    limit: int = 20,
    status_filter: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = VideoGenerationRepository(db)
        generations, total = await repo.get_user_generations(
            user_id=current_user.id,
            skip=skip,
            limit=limit,
            status=status_filter,
        )

        return TextToVideoHistoryResponse(
            items=[TextToVideoResponse.from_orm(g) for g in generations],
            total=total,
            page=skip // limit,
            page_size=limit,
        )

    except Exception as e:
        logger.error(f"Error fetching video history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch video history"
        )


@router.get("/{generation_id}", response_model=TextToVideoDetailResponse)
async def get_video_detail(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = VideoGenerationRepository(db)
        generation = await repo.get_by_id_and_user(generation_id, current_user.id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video generation not found"
            )

        response = TextToVideoDetailResponse.from_orm(generation)

        if generation.video_path:
            response.video_url = f"/api/v1/text-to-video/{generation.id}/file"
        if generation.thumbnail_path:
            response.thumbnail_url = f"/api/v1/text-to-video/{generation.id}/thumbnail"

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching video detail: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch video details"
        )


@router.delete("/{generation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = VideoGenerationRepository(db)
        generation = await repo.get_by_id_and_user(generation_id, current_user.id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video generation not found"
            )

        video_generation_service.cleanup_generated_files(generation_id)
        await repo.delete_by_id_and_user(generation_id, current_user.id)
        await db.commit()
        logger.info(f"Video generation deleted: {generation_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting video: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete video"
        )


@router.get("/{generation_id}/file")
async def get_video_file(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = VideoGenerationRepository(db)
        generation = await repo.get_by_id_and_user(generation_id, current_user.id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video generation not found"
            )

        if generation.status != "completed" or not generation.video_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video not ready or not available"
            )

        file_path = Path(generation.video_path)
        if not file_path.exists():
            logger.error(f"Video file not found: {file_path}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video file not found on disk"
            )

        return FileResponse(
            file_path,
            media_type="video/mp4",
            filename=f"generated-video-{generation_id}.mp4"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving video file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to serve video"
        )


@router.get("/{generation_id}/thumbnail")
async def get_video_thumbnail(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    try:
        repo = VideoGenerationRepository(db)
        generation = await repo.get_by_id_and_user(generation_id, current_user.id)

        if not generation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video generation not found"
            )

        if generation.status != "completed" or not generation.thumbnail_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thumbnail not ready or not available"
            )

        file_path = Path(generation.thumbnail_path)
        if not file_path.exists():
            logger.error(f"Thumbnail file not found: {file_path}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thumbnail file not found on disk"
            )

        return FileResponse(
            file_path,
            media_type="image/jpeg",
            filename=f"generated-video-{generation_id}-thumb.jpg"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving thumbnail: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to serve thumbnail"
        )


async def _generate_video_background(
    generation_id: uuid.UUID,
    prompt: str,
    duration: int,
    aspect_ratio: str,
    quality: str,
) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.config.settings import settings
    from app.db.session import get_encoded_db_url

    logger.info(f"Background video generation STARTED: {generation_id}")

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

    async def update_progress(percent: int) -> None:
        async with async_session() as db:
            try:
                repo = VideoGenerationRepository(db)
                await repo.update_progress(generation_id, progress_percent=percent)
                await db.commit()
            except Exception as e:
                logger.error(f"Progress update error: {e}")

    async with async_session() as db:
        try:
            repo = VideoGenerationRepository(db)
            generation = await repo.get_by_id(generation_id)
            if not generation:
                logger.error(f"Generation record not found: {generation_id}")
                return

            await repo.update_status(generation_id, status="processing")
            await db.commit()
            await update_progress(10)

            if image_service._pipeline is None:
                logger.info(f"Initializing image service for generation: {generation_id}")
                await image_service.initialize()
            await update_progress(15)

            frame_paths = await video_generation_service.generate_video_frames(
                prompt=prompt,
                generation_id=generation_id,
                count=4,
            )
            await update_progress(30)

            output_path = await video_generation_service.render_video(
                frame_paths=frame_paths,
                generation_id=generation_id,
                duration=duration,
                aspect_ratio=aspect_ratio,
                quality=quality,
            )
            await update_progress(85)

            thumbnail_path = video_generation_service.generate_thumbnail(generation_id)
            await update_progress(90)

            video_generation_service.cleanup_temp_frames(generation_id)
            await update_progress(95)

            await repo.update_status(
                generation_id,
                status="completed",
                video_path=str(output_path),
                thumbnail_path=str(thumbnail_path),
                duration_seconds=duration,
            )
            await db.commit()
            await update_progress(100)
            logger.info(f"Video generation COMPLETED: {generation_id}")

        except Exception as e:
            logger.error(f"Video generation FAILED: {generation_id} — {e}")
            error_message = str(e)[:1024]
            async with async_session() as db2:
                try:
                    repo = VideoGenerationRepository(db2)
                    await repo.update_status(
                        generation_id,
                        status="failed",
                        error_message=error_message,
                    )
                    await db2.commit()
                except Exception as e2:
                    logger.error(f"Failed to update error status: {e2}")
            video_generation_service.cleanup_temp_frames(generation_id)
