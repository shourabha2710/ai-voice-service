from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.tts import TTSRequest
from app.models.jobs import LongTTSRequest, JobProgress, JobStatus
from app.services.tts_service import tts_service
from app.services.job_service import job_service
from app.config.settings import settings
from typing import List, Optional
import os
import uuid
from datetime import datetime
from loguru import logger

from app.auth.dependencies import get_current_user_optional, get_current_user
from app.db.models.user import User
from app.db.session import get_db, AsyncSessionLocal
from app.db.repositories.audio import AudioGenerationRepository

router = APIRouter(prefix="/api/v1/tts", tags=["TTS"])

async def background_long_audio(job_id: str, request: LongTTSRequest, user_id: Optional[uuid.UUID]):
    """Background task wrapper to update DB after generation completes."""
    await tts_service.generate_long_audio(job_id, request)
    
    if user_id:
        async with AsyncSessionLocal() as session:
            try:
                repo = AudioGenerationRepository(session)
                db_job = await repo.get_by_job_id(job_id)
                if db_job:
                    mem_job = job_service.get_job(job_id)
                    if mem_job:
                        db_job.status = mem_job.status
                        db_job.audio_path = mem_job.output_file
                        if mem_job.status == "completed":
                            db_job.completed_at = datetime.utcnow()
                        await session.commit()
            except Exception as e:
                logger.error(f"Error updating DB for background job {job_id}: {str(e)}")


@router.post("/generate", summary="Generate TTS Audio (Short)")
async def generate_tts(
    request: TTSRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate an MP3 audio file from text (limit: 5000 chars).
    Now automatically persists the generation for history recovery.
    """
    try:
        audio_data = await tts_service.generate_speech(
            text=request.text,
            voice=request.voice,
            rate=request.rate,
            pitch=request.pitch
        )
        
        job_id = job_service.create_job()
        output_file = f"short_{job_id}.mp3"
        file_path = settings.audio_path / output_file
        
        with open(file_path, "wb") as f:
            f.write(audio_data)
            
        job_service.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            output_file=output_file,
            completed_chunks=1,
            total_chunks=1
        )

        if current_user:
            repo = AudioGenerationRepository(db)
            await repo.create(
                user_id=current_user.id,
                job_id=job_id,
                type="short",
                status="completed",
                voice=request.voice,
                text_length=len(request.text),
                audio_path=output_file,
                completed_at=datetime.utcnow()
            )

        filename = request.download_filename or f"speech_{job_id}.mp3"
        if not filename.endswith(".mp3"):
            filename += ".mp3"
            
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Job-ID": job_id,
                "Access-Control-Expose-Headers": "X-Job-ID"
            }
        )
    except Exception as e:
        logger.error(f"TTS Generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS Generation failed: {str(e)}")


@router.post("/generate-long-audio", summary="Start Long Audio Generation Job")
async def generate_long_audio(
    request: LongTTSRequest, 
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Start a background job to generate long audio (up to 50,000 chars).
    Returns a job_id to track progress.
    """
    job_id = job_service.create_job()
    
    if current_user:
        repo = AudioGenerationRepository(db)
        await repo.create(
            user_id=current_user.id,
            job_id=job_id,
            type="long",
            status="pending",
            voice=request.voice,
            text_length=len(request.text)
        )
        
    background_tasks.add_task(background_long_audio, job_id, request, current_user.id if current_user else None)
    return {"job_id": job_id, "message": "Long audio generation started in background."}


@router.get("/job/{job_id}", response_model=JobProgress, summary="Get Job Status")
async def get_job_status(
    job_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the current status and progress of a long audio generation job.
    Enforces user ownership if job was created by an authenticated user.
    """
    repo = AudioGenerationRepository(db)
    db_job = await repo.get_by_job_id(job_id)
    
    # Ownership check
    if db_job:
        if not current_user or db_job.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this job")
            
    # Priority to memory job for progress, fallback to db job
    mem_job = job_service.get_job(job_id)
    if mem_job:
        return mem_job
        
    if db_job:
        return JobProgress(
            job_id=db_job.job_id,
            status=JobStatus(db_job.status),
            progress=100.0 if db_job.status == "completed" else 0.0,
            created_at=db_job.created_at,
            updated_at=db_job.completed_at or db_job.created_at,
            output_file=db_job.audio_path
        )
        
    raise HTTPException(status_code=404, detail="Job not found")


@router.get("/job/{job_id}/download", summary="Download Completed Audio")
async def download_job_result(
    job_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Download the final MP3 file for a completed job.
    Enforces user ownership if job was created by an authenticated user.
    """
    repo = AudioGenerationRepository(db)
    db_job = await repo.get_by_job_id(job_id)
    
    if db_job:
        if not current_user or db_job.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this job")
        
        if db_job.status != "completed":
            raise HTTPException(status_code=400, detail=f"Job is in {db_job.status} state")
            
        output_file = db_job.audio_path
    else:
        mem_job = job_service.get_job(job_id)
        if not mem_job:
            raise HTTPException(status_code=404, detail="Job not found")
        if mem_job.status != "completed":
            raise HTTPException(status_code=400, detail=f"Job is in {mem_job.status} state")
        output_file = mem_job.output_file

    if not output_file:
        raise HTTPException(status_code=500, detail="Output file missing in job record")
        
    file_path = settings.audio_path / output_file
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on server")
        
    return FileResponse(
        path=file_path,
        media_type="audio/mpeg",
        filename=f"speech_{job_id}.mp3"
    )


@router.delete("/job/{job_id}", summary="Delete Job and Files")
async def delete_job(
    job_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a job record and its associated audio file.
    Enforces user ownership if job was created by an authenticated user.
    """
    repo = AudioGenerationRepository(db)
    db_job = await repo.get_by_job_id(job_id)
    
    if db_job:
        if not current_user or db_job.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this job")
        
        # Delete file if exists
        if db_job.audio_path:
            file_path = settings.audio_path / db_job.audio_path
            if file_path.exists():
                file_path.unlink()
                
        await repo.delete(db_job.id)
        
    mem_job = job_service.get_job(job_id)
    if mem_job:
        if mem_job.output_file and not db_job:
            file_path = settings.audio_path / mem_job.output_file
            if file_path.exists():
                file_path.unlink()
        job_service.delete_job(job_id)
        
    if not db_job and not mem_job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {"message": f"Job {job_id} and associated files deleted."}


@router.get("/voices", response_model=List[dict], summary="List Available Voices")
async def get_voices():
    """
    Returns a list of all available neural voices from edge-tts.
    """
    return await tts_service.get_all_voices()
