import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, validator


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="Text prompt for image generation"
    )

    @validator('prompt')
    def prompt_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Prompt cannot be empty or whitespace only")
        return v.strip()


class ImageGenerationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    prompt: str
    status: str  # pending, processing, completed, failed
    image_path: Optional[str]
    provider: str
    generation_time_seconds: Optional[float]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class ImageHistoryResponse(BaseModel):
    items: list[ImageGenerationResponse]
    total: int
    page: int
    page_size: int


class ImageDetailResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    prompt: str
    status: str
    image_path: Optional[str]
    image_url: Optional[str] = None  # Pre-signed URL or safe serving URL
    provider: str
    generation_time_seconds: Optional[float]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
