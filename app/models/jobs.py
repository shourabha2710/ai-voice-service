from uuid import UUID, uuid4
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class JobProgress(BaseModel):
    job_id: str
    status: JobStatus
    progress: float = 0.0
    completed_chunks: int = 0
    total_chunks: int = 0
    message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    output_file: Optional[str] = None
    error: Optional[str] = None

class LongTTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000)
    voice: str = Field(default="en-US-GuyNeural")
    rate: str = Field(default="+0%")
    pitch: str = Field(default="+0Hz")
    chunk_size: int = Field(default=4000, ge=1000, le=10000)
