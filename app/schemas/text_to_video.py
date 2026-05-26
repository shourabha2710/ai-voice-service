import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, validator


class TextToVideoRequest(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="Text prompt for video generation"
    )
    duration: int = Field(
        16,
        ge=8,
        le=60,
        description="Total video duration in seconds"
    )
    aspect_ratio: str = Field(
        "16:9",
        description="Video aspect ratio (16:9 or 9:16)"
    )
    quality: str = Field(
        "standard",
        description="Video quality (standard, high)"
    )

    @validator('prompt')
    def prompt_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Prompt cannot be empty or whitespace only")
        return v.strip()

    @validator('aspect_ratio')
    def validate_aspect_ratio(cls, v):
        if v not in ("16:9", "9:16"):
            raise ValueError("Aspect ratio must be 16:9 or 9:16")
        return v

    @validator('quality')
    def validate_quality(cls, v):
        if v not in ("standard", "high"):
            raise ValueError("Quality must be standard or high")
        return v


class TextToVideoResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    prompt: str
    status: str
    video_path: Optional[str]
    thumbnail_path: Optional[str]
    duration_seconds: Optional[int]
    aspect_ratio: str
    resolution: str
    progress_percent: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class TextToVideoHistoryResponse(BaseModel):
    items: list[TextToVideoResponse]
    total: int
    page: int
    page_size: int


class TextToVideoDetailResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    prompt: str
    status: str
    video_path: Optional[str]
    video_url: Optional[str] = None
    thumbnail_path: Optional[str]
    thumbnail_url: Optional[str] = None
    duration_seconds: Optional[int]
    aspect_ratio: str
    resolution: str
    progress_percent: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
