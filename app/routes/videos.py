import uuid
from loguru import logger
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.db.models.user import User
from app.db.repositories.video import VideoDownloadRepository
from app.schemas.video import (
    VideoDownloadRequest,
    VideoDownloadResponse,
    VideoDownloadHistoryResponse,
    VideoDownloadDetailResponse,
    CancelResponse,
)
from app.services.video_download_service import video_download_service
from app.utils.url_utils import sanitize_url_for_logging

router = APIRouter(prefix="/api/v1/videos", tags=["videos"])


@router.post("/download", response_model=VideoDownloadResponse, status_code=status.HTTP_202_ACCEPTED)
async def download_video(
    request: VideoDownloadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """
    Queue a video/audio download from YouTube or Instagram.
    Returns immediately with a pending record (202 Accepted).
    Download happens in the background.
    """
    logger.info(
        f"POST /download hit — user={current_user.id} url='{sanitize_url_for_logging(request.url)}' type={request.download_type}"
    )

    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Your account is inactive"
        )

    valid, platform_or_error = video_download_service.validate_url(request.url)
    if not valid:
        logger.warning(f"Invalid URL from user {current_user.id}: {platform_or_error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=platform_or_error
        )

    try:
        repo = VideoDownloadRepository(db)
        download = await repo.create(
            user_id=current_user.id,
            url=request.url,
            platform=platform_or_error,
            download_type=request.download_type,
        )
        await db.commit()
        logger.info(f"Download record created: {download.id}")

        background_tasks.add_task(
            video_download_service.download_media,
            download_id=download.id,
            url=request.url,
            download_type=request.download_type,
        )

        logger.info(
            f"Background task scheduled for download: {download.id} for user {current_user.id}"
        )

        return VideoDownloadResponse.from_orm(download)

    except Exception as e:
        logger.error(f"Error creating download record: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue download",
        )


@router.get("/me", response_model=VideoDownloadHistoryResponse)
async def get_download_history(
    skip: int = 0,
    limit: int = 20,
    status_filter: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get paginated download history for the current user.
    Supports filtering by status (pending, downloading, processing, completed, failed, cancelled, active).
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Your account is inactive"
        )

    if limit <= 0 or limit > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid limit; must be 1-100")

    try:
        repo = VideoDownloadRepository(db)
        downloads, total = await repo.get_user_downloads(
            user_id=current_user.id, skip=skip, limit=limit, status=status_filter
        )

        page_num = (skip // limit) if limit else 0

        items = []
        for d in downloads:
            resp = VideoDownloadResponse.from_orm(d)
            progress = video_download_service.get_progress(d.id)
            if progress and d.status in ("downloading", "pending"):
                resp.progress_percent = progress.get("progress_percent", resp.progress_percent)
                resp.downloaded_bytes = progress.get("downloaded_bytes", resp.downloaded_bytes)
                resp.total_bytes = progress.get("total_bytes", resp.total_bytes)
                resp.download_speed = progress.get("download_speed", resp.download_speed)
                resp.eta_seconds = progress.get("eta_seconds", resp.eta_seconds)
            items.append(resp)

        return VideoDownloadHistoryResponse(
            items=items,
            total=total,
            page=page_num,
            page_size=limit,
        )

    except Exception as e:
        logger.error(f"Error fetching download history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch download history",
        )


@router.get("/{download_id}", response_model=VideoDownloadDetailResponse)
async def get_download_detail(
    download_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get details of a specific download with live progress when active.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Your account is inactive"
        )

    try:
        repo = VideoDownloadRepository(db)
        download = await repo.get_by_id_and_user(download_id, current_user.id)

        if not download:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Download not found"
            )

        resp = VideoDownloadDetailResponse.from_orm(download)

        progress = video_download_service.get_progress(download_id)
        if progress and download.status in ("downloading", "pending"):
            resp.progress_percent = progress.get("progress_percent", resp.progress_percent)
            resp.downloaded_bytes = progress.get("downloaded_bytes", resp.downloaded_bytes)
            resp.total_bytes = progress.get("total_bytes", resp.total_bytes)
            resp.download_speed = progress.get("download_speed", resp.download_speed)
            resp.eta_seconds = progress.get("eta_seconds", resp.eta_seconds)

        return resp

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching download detail: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch download",
        )


@router.post("/{download_id}/cancel", response_model=CancelResponse)
async def cancel_download(
    download_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel an active download.
    Only works for pending, downloading, or processing status.
    Stops the yt-dlp process, marks as cancelled, and cleans up partial files.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Your account is inactive"
        )

    try:
        repo = VideoDownloadRepository(db)
        download = await repo.get_by_id_and_user(download_id, current_user.id)

        if not download:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Download not found"
            )

        if download.status not in ("pending", "downloading", "processing"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel download with status '{download.status}'",
            )

        cancelled = await video_download_service.cancel_download(download_id)

        if cancelled:
            return CancelResponse(success=True, message="Download cancelled")
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to cancel download",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling download: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel download",
        )


@router.get("/{download_id}/file")
async def download_file(
    download_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the media file. Only the owner can download their completed file."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Your account is inactive"
        )

    try:
        repo = VideoDownloadRepository(db)
        download = await repo.get_by_id_and_user(download_id, current_user.id)

        if not download:
            logger.warning(
                f"File download attempt for non-existent download: {download_id} by user {current_user.id}"
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Download not found"
            )

        if download.status != "completed":
            logger.warning(
                f"File download attempt for incomplete download: {download_id} status={download.status}"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Download not completed (status: {download.status})",
            )

        file_path = Path(download.file_path)
        try:
            resolved = file_path.resolve()
            storage_dir = Path("storage/downloaded-videos").resolve()
            if storage_dir not in resolved.parents and resolved != storage_dir:
                logger.error(f"Illegal file path access attempt: {resolved}")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")
            if not resolved.exists():
                logger.error(f"File not found on disk: {resolved}")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
            file_path = resolved
        except Exception as e:
            logger.error(f"File path validation error: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")

        if download.download_type == "audio":
            media_type = "audio/mpeg"
            extension = "mp3"
        else:
            media_type = "video/mp4"
            extension = "mp4"

        filename = f"{download.title or 'download'}.{extension}"

        logger.info(
            f"Serving file download: {download_id} for user {current_user.id} filename={filename}"
        )

        return FileResponse(
            file_path, media_type=media_type, filename=filename,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving file download: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download file",
        )


@router.delete("/{download_id}")
async def delete_download(
    download_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a download and its associated file."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Your account is inactive"
        )

    try:
        repo = VideoDownloadRepository(db)
        download = await repo.get_by_id_and_user(download_id, current_user.id)

        if not download:
            logger.warning(
                f"Delete attempt for non-existent download: {download_id} by user {current_user.id}"
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Download not found"
            )

        if download.file_path:
            file_path = Path(download.file_path)
            try:
                resolved = file_path.resolve()
                storage_dir = Path("storage/downloaded-videos").resolve()
                if storage_dir not in resolved.parents and resolved != storage_dir:
                    logger.error(f"Illegal file path deletion attempt: {resolved}")
                else:
                    if resolved.exists():
                        try:
                            resolved.unlink()
                            logger.info(f"Deleted download file: {resolved}")
                        except Exception as e:
                            logger.error(f"Failed to delete file {resolved}: {e}")
            except Exception as e:
                logger.error(f"File deletion path validation error: {e}")

        download_dir = Path("storage/downloaded-videos").resolve() / str(download_id)
        if download_dir.exists():
            try:
                import shutil
                shutil.rmtree(download_dir)
                logger.info(f"Deleted download directory: {download_dir}")
            except Exception as e:
                logger.error(f"Failed to delete directory {download_dir}: {e}")

        deleted = await repo.delete_by_id_and_user(download_id, current_user.id)
        await db.commit()

        if deleted:
            logger.info(f"Download deleted: {download_id} for user {current_user.id}")
            return {"success": True, "message": "Download deleted"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete download",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting download: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete download",
        )
