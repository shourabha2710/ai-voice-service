from pydantic_settings import BaseSettings
from pydantic import validator
from typing import Optional
from pathlib import Path

class Settings(BaseSettings):
    APP_NAME: str = "Edge TTS Service"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    MAX_TEXT_LENGTH: int = 50000
    MAX_CHUNK_SIZE: int = 4000
    MAX_CONCURRENT_CHUNKS: int = 3
    MAX_RETRY_COUNT: int = 3
    TEMP_DIR: Path = Path("temp_chunks").resolve()
    OUTPUT_DIR: Path = Path("generated_audio").resolve()
    LOG_DIR: Path = Path("logs").resolve()
    JOB_EXPIRATION_MINUTES: int = 60
    CLEANUP_INTERVAL_MINUTES: int = 30
    FFMPEG_PATH: Optional[Path] = None
    
    # Computed paths
    @property
    def temp_path(self) -> Path:
        return self.TEMP_DIR
    
    @property
    def audio_path(self) -> Path:
        return self.OUTPUT_DIR
    
    @property
    def log_path(self) -> Path:
        return self.LOG_DIR
    
    @property
    def FILE_EXPIRATION_SECONDS(self) -> int:
        return self.JOB_EXPIRATION_MINUTES * 60
    
    @property
    def CLEAN_UP_INTERVAL_SECONDS(self) -> int:
        return self.CLEANUP_INTERVAL_MINUTES * 60
    
    def get_ffmpeg_path(self) -> Optional[str]:
        """Get FFmpeg path from config, system PATH, or imageio-ffmpeg."""
        if self.FFMPEG_PATH and self.FFMPEG_PATH.exists():
            return str(self.FFMPEG_PATH)
        
        import shutil
        path = shutil.which("ffmpeg")
        if path:
            return path
        
        # Try imageio-ffmpeg as fallback
        try:
            import imageio_ffmpeg
            return imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass
        
        return None
    
    @validator('FFMPEG_PATH')
    def validate_ffmpeg_path(cls, v):
        if v is not None and not v.exists():
            raise ValueError(f"FFMPEG_PATH {v} does not exist")
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()


