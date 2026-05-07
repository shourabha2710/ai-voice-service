from pydantic import BaseModel, Field
from enum import Enum
from uuid import UUID

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000)
    voice: str = Field(default="en-US-JennyNeural")
    rate: str = Field(default="+0%")
    pitch: str = Field(default="+0Hz")

class LongTTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000)
    voice: str = Field(default="en-US-JennyNeural")
    rate: str = Field(default="+0%")
    pitch: str = Field(default="+0Hz")
    chunk_size: int = Field(default=4000, ge=1000, le=10000)

class JobResponse(BaseModel):
    job_id: UUID
    status: JobStatus
    progress: int = 0
    total_chunks: int = 0
    completed_chunks: int = 0
    voice: str
    created_at: str
    updated_at: str
    download_url: str = None
    error: str = None

class VoiceInfo(BaseModel):
    Name: str
    ShortName: str
    Locale: str
    Gender: str
    FriendlyName: str
