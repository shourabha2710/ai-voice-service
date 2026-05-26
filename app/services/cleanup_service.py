import asyncio
import uuid
from loguru import logger
from datetime import datetime
from pathlib import Path
import shutil
from sqlalchemy import select
from app.config.settings import settings
from app.services.job_service import job_service

class CleanupService:
    def __init__(self):
        self.running = False
        logger.info("CleanupService initialized")
    
    async def start(self):
        self.running = True
        logger.info("Cleanup service started")
        while self.running:
            try:
                await self.cleanup_expired_jobs()
                await self.cleanup_old_files()
                await self.cleanup_old_video_downloads()
                await self.cleanup_old_video_generations()
                await asyncio.sleep(settings.CLEANUP_INTERVAL_MINUTES * 60)
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
                await asyncio.sleep(60)
    
    async def stop(self):
        self.running = False
        logger.info("Cleanup service stopped")
    
    async def cleanup_expired_jobs(self):
        count = job_service.cleanup_expired_jobs()
        if count and count > 0:
            logger.info(f"Cleaned up {count} expired jobs")
    
    async def cleanup_old_files(self):
        try:
            expiration = settings.JOB_EXPIRATION_MINUTES
            if expiration is None:
                return
            cutoff = datetime.utcnow().timestamp() - (expiration * 60)
            
            for dir_path in [settings.audio_path, settings.temp_path]:
                if not dir_path.exists():
                    continue
                for file_path in list(dir_path.iterdir()):
                    try:
                        if file_path.is_file() and file_path.stat().st_mtime < cutoff:
                            file_path.unlink()
                            logger.info(f"Deleted old file: {file_path}")
                    except FileNotFoundError:
                        pass
        except Exception as e:
            logger.error(f"File cleanup error: {e}")
    
    async def cleanup_old_video_downloads(self):
        """Clean up old video downloads from filesystem and database."""
        try:
            expiration = settings.JOB_EXPIRATION_MINUTES
            if expiration is None:
                return
            cutoff = datetime.utcnow().timestamp() - (expiration * 60)
            # Database-aware cleanup: first find DB records eligible for deletion
            video_storage = Path("storage/downloaded-videos")
            try:
                from app.db.session import AsyncSessionLocal
                from app.db.repositories.video import VideoDownloadRepository
                from app.db.models.video import VideoDownload

                async with AsyncSessionLocal() as session:
                    # find completed/failed downloads older than cutoff
                    result = await session.execute(
                        select(VideoDownload.id).where(
                            (VideoDownload.completed_at.isnot(None)) &
                            (VideoDownload.created_at < datetime.fromtimestamp(cutoff)) &
                            ((VideoDownload.status == "completed") | (VideoDownload.status == "failed"))
                        )
                    )
                    eligible_rows = result.scalars().all()
                    eligible_ids = set(str(r) for r in eligible_rows)

                    # Clean up filesystem only for eligible downloads or orphaned dirs
                    if video_storage.exists():
                        for download_dir in list(video_storage.iterdir()):
                            try:
                                if not download_dir.is_dir():
                                    continue

                                # only consider dirs that are older than cutoff
                                if download_dir.stat().st_mtime >= cutoff:
                                    continue

                                name = download_dir.name
                                try:
                                    dir_uuid = uuid.UUID(name)
                                    dir_uuid_str = str(dir_uuid)
                                except Exception:
                                    # Non-UUID directory — treat as orphan and delete
                                    shutil.rmtree(download_dir)
                                    logger.info(f"Deleted orphaned old video download directory: {download_dir}")
                                    continue

                                # If DB indicates this download is eligible, delete
                                if dir_uuid_str in eligible_ids:
                                    shutil.rmtree(download_dir)
                                    logger.info(f"Deleted old video download directory: {download_dir}")
                                    continue

                                # Otherwise check DB record to avoid deleting in-progress downloads
                                repo = VideoDownloadRepository(session)
                                download = await repo.get_by_id(dir_uuid)
                                if not download:
                                    # Orphaned directory, safe to delete
                                    shutil.rmtree(download_dir)
                                    logger.info(f"Deleted orphaned old video download directory: {download_dir}")
                                    continue

                                # If download is in-progress, skip deletion to avoid race conditions
                                if download.status in ["downloading", "processing", "pending"]:
                                    logger.warning(f"Skipping cleanup of in-progress download {dir_uuid_str}")
                                    continue

                                # Otherwise, not eligible due to timestamps/status; skip
                            except (FileNotFoundError, OSError) as e:
                                logger.error(f"Error deleting directory {download_dir}: {e}")

                    # Finally, delete DB records for eligible downloads
                    repo = VideoDownloadRepository(session)
                    count = await repo.delete_old_downloads(cutoff)
                    await session.commit()
                    if count > 0:
                        logger.info(f"Deleted {count} old video download records from database")

            except Exception as e:
                logger.error(f"Error cleaning up video download database records: {e}")
        
        except Exception as e:
            logger.error(f"Video download cleanup error: {e}")

# Remove global singleton - use dependency injection instead

    async def cleanup_old_video_generations(self):
        """Clean up old video generation files from filesystem and database."""
        try:
            expiration = settings.JOB_EXPIRATION_MINUTES
            if expiration is None:
                return
            cutoff = datetime.utcnow().timestamp() - (expiration * 60)

            try:
                from app.db.session import AsyncSessionLocal
                from app.db.repositories.video_generation import VideoGenerationRepository
                from app.db.models.video_generation import VideoGeneration

                async with AsyncSessionLocal() as session:
                    repo = VideoGenerationRepository(session)
                    result = await session.execute(
                        select(VideoGeneration).where(
                            (VideoGeneration.completed_at.isnot(None)) &
                            (VideoGeneration.created_at < datetime.fromtimestamp(cutoff)) &
                            ((VideoGeneration.status == "completed") | (VideoGeneration.status == "failed"))
                        )
                    )
                    old_generations = result.scalars().all()

                    for gen in old_generations:
                        try:
                            from app.services.video_generation_service import video_generation_service
                            video_generation_service.cleanup_generated_files(gen.id)
                            await session.delete(gen)
                            logger.info(f"Cleaned up old video generation: {gen.id}")
                        except Exception as e:
                            logger.error(f"Error cleaning up video generation {gen.id}: {e}")

                    if old_generations:
                        await session.commit()
                        logger.info(f"Cleaned up {len(old_generations)} old video generations")

            except Exception as e:
                logger.error(f"Error cleaning up video generation records: {e}")

        except Exception as e:
            logger.error(f"Video generation cleanup error: {e}")


cleanup_service = CleanupService()


