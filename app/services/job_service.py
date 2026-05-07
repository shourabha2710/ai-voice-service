import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional
from loguru import logger
from app.models.jobs import JobProgress, JobStatus
from app.config.settings import settings

class JobService:
    def __init__(self):
        self._jobs: Dict[str, JobProgress] = {}
        logger.info("JobService initialized")

    def create_job(self) -> str:
        job_id = str(uuid.uuid4())
        now = datetime.now()
        job = JobProgress(
            job_id=job_id,
            status=JobStatus.PENDING,
            progress=0.0,
            completed_chunks=0,
            total_chunks=0,
            created_at=now,
            updated_at=now
        )
        self._jobs[job_id] = job
        logger.info(f"Created job: {job_id}")
        return job_id

    def update_job(self, job_id: str, **kwargs) -> Optional[JobProgress]:
        if job_id not in self._jobs:
            return None
        
        job = self._jobs[job_id]
        for key, value in kwargs.items():
            if hasattr(job, key):
                setattr(job, key, value)
        
        job.updated_at = datetime.now()
        
        if job.total_chunks > 0:
            job.progress = round((job.completed_chunks / job.total_chunks) * 100, 2)
            
        return job

    def get_job(self, job_id: str) -> Optional[JobProgress]:
        return self._jobs.get(job_id)

    def delete_job(self, job_id: str) -> bool:
        if job_id in self._jobs:
            del self._jobs[job_id]
            logger.info(f"Deleted job: {job_id}")
            return True
        return False

    def cleanup_expired_jobs(self):
        now = datetime.now()
        expiration_delta = timedelta(minutes=settings.JOB_EXPIRATION_MINUTES)
        
        expired_ids = [
            job_id for job_id, job in self._jobs.items()
            if now - job.updated_at > expiration_delta
        ]
        
        for job_id in expired_ids:
            self.delete_job(job_id)
        
        if expired_ids:
            logger.info(f"Cleaned up {len(expired_ids)} expired jobs.")

job_service = JobService()
