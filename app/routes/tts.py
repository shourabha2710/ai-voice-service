from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, Response
from app.models.tts import TTSRequest
from app.models.jobs import LongTTSRequest, JobProgress
from app.services.tts_service import tts_service
from app.services.job_service import job_service
from app.config.settings import settings
from typing import List
import os

router = APIRouter(prefix="/api/v1/tts", tags=["TTS"])

@router.post("/generate", summary="Generate TTS Audio (Short)")
async def generate_tts(request: TTSRequest):
    """
    Generate an MP3 audio file from text (limit: 5000 chars).
    """
    try:
        audio_data = await tts_service.generate_speech(
            text=request.text,
            voice=request.voice,
            rate=request.rate,
            pitch=request.pitch
        )
        
        filename = request.download_filename or "speech.mp3"
        if not filename.endswith(".mp3"):
            filename += ".mp3"
            
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS Generation failed: {str(e)}")

@router.post("/generate-long-audio", summary="Start Long Audio Generation Job")
async def generate_long_audio(request: LongTTSRequest, background_tasks: BackgroundTasks):
    """
    Start a background job to generate long audio (up to 50,000 chars).
    Returns a job_id to track progress.
    """
    job_id = job_service.create_job()
    background_tasks.add_task(tts_service.generate_long_audio, job_id, request)
    return {"job_id": job_id, "message": "Long audio generation started in background."}

@router.get("/job/{job_id}", response_model=JobProgress, summary="Get Job Status")
async def get_job_status(job_id: str):
    """
    Get the current status and progress of a long audio generation job.
    """
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/job/{job_id}/download", summary="Download Completed Long Audio")
async def download_job_result(job_id: str):
    """
    Download the final MP3 file for a completed job.
    """
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != "completed":
        raise HTTPException(status_code=400, detail=f"Job is in {job.status} state")
    
    if not job.output_file:
        raise HTTPException(status_code=500, detail="Output file missing in job record")
        
    file_path = settings.audio_path / job.output_file
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on server")
        
    return FileResponse(
        path=file_path,
        media_type="audio/mpeg",
        filename=f"long_speech_{job_id}.mp3"
    )

@router.delete("/job/{job_id}", summary="Delete Job and Files")
async def delete_job(job_id: str):
    """
    Delete a job record and its associated audio file.
    """
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete file if exists
    if job.output_file:
        file_path = settings.audio_path / job.output_file
        if file_path.exists():
            file_path.unlink()
            
    job_service.delete_job(job_id)
    return {"message": f"Job {job_id} and associated files deleted."}

@router.get("/voices", response_model=List[dict], summary="List Available Voices")
async def get_voices():
    """
    Returns a list of all available neural voices from edge-tts.
    """
    return await tts_service.get_all_voices()
