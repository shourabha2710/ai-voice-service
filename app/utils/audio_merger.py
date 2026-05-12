import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning, module="pydub")

from pydub import AudioSegment
from pathlib import Path
from loguru import logger
import subprocess
import os

# Configure pydub to use the correct ffmpeg path
def _configure_pydub_ffmpeg():
    try:
        from app.config.settings import settings
        ffmpeg_path = settings.get_ffmpeg_path()
        if ffmpeg_path:
            AudioSegment.converter = ffmpeg_path
    except Exception:
        pass

_configure_pydub_ffmpeg()

def get_ffmpeg_path():
    """Get FFmpeg path from settings, system PATH, or imageio-ffmpeg."""
    from app.config.settings import settings
    return settings.get_ffmpeg_path()

def merge_audio_chunks(chunk_paths: list, output_path: Path) -> bool:
    """
    Merge multiple audio chunks into a single file using FFmpeg directly.
    """
    try:
        ffmpeg_path = get_ffmpeg_path()
        logger.info(f"Attempting merge. get_ffmpeg_path() returned: {ffmpeg_path}")
        
        if not ffmpeg_path:
            logger.error("FFmpeg is not installed or not found in PATH")
            return False
        
        logger.info(f"Using FFmpeg at: {ffmpeg_path}")
        logger.info(f"Merging {len(chunk_paths)} chunks into {output_path}")
        
        # Check if all chunk files exist
        for p in chunk_paths:
            if not Path(p).exists():
                logger.error(f"Chunk file not found: {p}")
                return False
        
        # Create a temporary file list for ffmpeg
        list_file = output_path.parent / f"chunklist_{output_path.stem}.txt"
        
        # Write the list file
        with open(list_file, "w") as f:
            for chunk_path in chunk_paths:
                p = Path(chunk_path)
                f.write(f"file '{p.as_posix()}'\n")
        
        # Run ffmpeg to concatenate
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        cmd = [
            ffmpeg_path,
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(output_path),
            "-y"
        ]
        
        logger.info(f"Running FFmpeg command")
        
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Clean up list file
        if list_file.exists():
            list_file.unlink()
        
        if result.returncode != 0:
            error_msg = result.stderr.decode()
            logger.error(f"FFmpeg failed: {error_msg}")
            return False
        
        if not output_path.exists():
            logger.error(f"Output file was not created: {output_path}")
            return False
        
        logger.info(f"Successfully merged {len(chunk_paths)} chunks into {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to merge audio chunks: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def cleanup_temp_files(file_paths: list):
    """
    Delete temporary files after merging.
    """
    for file_path in file_paths:
        try:
            p = Path(file_path)
            if p.exists():
                p.unlink()
                logger.info(f"Deleted temp file: {p}")
        except Exception as e:
            logger.error(f"Failed to delete temp file {file_path}: {e}")

# Alias for backward compatibility
merge_mp3_files = merge_audio_chunks
