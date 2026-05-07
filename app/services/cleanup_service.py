import asyncio
from loguru import logger
from datetime import datetime
from pathlib import Path
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

# Remove global singleton - use dependency injection instead

cleanup_service = CleanupService()

