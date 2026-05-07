import edge_tts
from pathlib import Path
from loguru import logger
from app.config.settings import settings
from app.utils.text_chunker import split_text_into_chunks
from app.utils.audio_merger import merge_audio_chunks, cleanup_temp_files
from app.services.job_service import job_service, JobStatus
import asyncio
import uuid

class TTSService:
    def __init__(self):
        settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
        settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_CHUNKS)
        logger.info("TTSService initialized")

    async def generate_speech(self, text: str, voice: str, rate: str = "+0%", pitch: str = "+0Hz") -> bytes:
        """Generate short audio (direct, no chunking)."""
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return audio_data

    @staticmethod
    async def get_all_voices() -> list:
        """Return all available edge-tts voices."""
        return await edge_tts.list_voices()

    async def generate_long_audio(self, job_id: str, request) -> None:
        """
        Process long audio generation with chunking, parallel generation, and merging.
        This replaces the old ChunkTTSService.process_long_audio.
        """
        try:
            # 1. Update status to processing
            job_service.update_job(job_id, status=JobStatus.PROCESSING, message="Splitting text into chunks...")
            
            # 2. Chunk text
            chunks = split_text_into_chunks(request.text, settings.MAX_CHUNK_SIZE)
            total_chunks = len(chunks)
            job_service.update_job(job_id, total_chunks=total_chunks, message=f"Generating {total_chunks} chunks...")
            
            # 3. Generate chunks in parallel with concurrency limit
            async def generate_chunk_with_semaphore(text: str, idx: int) -> Path:
                async with self._semaphore:
                    return await self._generate_chunk(text, request.voice, request.rate, request.pitch, job_id, idx)
            
            tasks = [generate_chunk_with_semaphore(text, i) for i, text in enumerate(chunks)]
            chunk_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Collect successful chunk paths and update progress
            chunk_paths = []
            for i, result in enumerate(chunk_results):
                if isinstance(result, Exception):
                    logger.error(f"Job {job_id}: Chunk {i} failed - {result}")
                    job_service.update_job(job_id, status=JobStatus.FAILED, error=str(result))
                    # Cleanup any chunks generated so far
                    for p in chunk_paths:
                        try:
                            p.unlink()
                        except:
                            pass
                    return
                chunk_paths.append(result)
                job_service.update_job(job_id, completed_chunks=len(chunk_paths))
            
            # Sort chunks by index to ensure correct order
            chunk_paths.sort(key=lambda p: int(p.stem.split('_')[-1]))
            
            # 4. Merge chunks
            job_service.update_job(job_id, message="Merging audio chunks...")
            final_filename = f"{uuid.uuid4()}.mp3"
            final_path = settings.OUTPUT_DIR / final_filename
            
            success = merge_audio_chunks(chunk_paths, final_path)
            
            # 5. Cleanup temp chunks
            cleanup_temp_files(chunk_paths)
            
            if not success:
                raise RuntimeError("Failed to merge audio chunks.")
            
            # 6. Mark as completed
            job_service.update_job(
                job_id,
                status=JobStatus.COMPLETED,
                message="Generation completed successfully.",
                output_file=final_filename,
                progress=100.0
            )
            logger.info(f"Job {job_id} completed. Final file: {final_filename}")
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {str(e)}")
            job_service.update_job(
                job_id,
                status=JobStatus.FAILED,
                message="Generation failed.",
                error=str(e)
            )
            # Cleanup any leftover chunks for this job
            for p in settings.TEMP_DIR.glob(f"{job_id}_chunk_*.mp3"):
                try:
                    p.unlink()
                except:
                    pass

    async def _generate_chunk(self, text: str, voice: str, rate: str, pitch: str, job_id: str, index: int) -> Path:
        """Generate a single audio chunk with retries."""
        file_name = f"{job_id}_chunk_{index}.mp3"
        output_path = settings.TEMP_DIR / file_name
        
        retry_count = 0
        while retry_count < settings.MAX_RETRY_COUNT:
            try:
                communicate = edge_tts.Communicate(
                    text=text,
                    voice=voice,
                    rate=rate,
                    pitch=pitch
                )
                await communicate.save(str(output_path))
                logger.debug(f"Generated chunk {index} for job {job_id}")
                return output_path
            except Exception as e:
                retry_count += 1
                logger.warning(f"Retry {retry_count} for chunk {index}, job {job_id}: {str(e)}")
                if retry_count >= settings.MAX_RETRY_COUNT:
                    logger.error(f"Failed to generate chunk {index} after {settings.MAX_RETRY_COUNT} retries.")
                    raise e
                await asyncio.sleep(1 * retry_count)  # Exponential-ish backoff

tts_service = TTSService()
