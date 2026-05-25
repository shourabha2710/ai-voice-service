import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, validator


class VideoDownloadRequest(BaseModel):
    url: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="YouTube or Instagram URL"
    )
    download_type: str = Field(
        ...,
        description="Type of download: 'audio' for MP3 or 'video' for MP4"
    )

    @validator('url')
    def url_not_empty(cls, v):
        if not v.strip():
            raise ValueError("URL cannot be empty or whitespace only")
        return v.strip()

    @validator('download_type')
    def valid_download_type(cls, v):
        if v not in ["audio", "video"]:
            raise ValueError("download_type must be 'audio' or 'video'")
        return v


class VideoDownloadResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    url: str
    platform: str  # youtube, instagram
    download_type: str  # audio, video
    title: Optional[str]
    status: str  # pending, downloading, processing, completed, failed
    file_path: Optional[str]
    thumbnail_url: Optional[str]
    duration_seconds: Optional[int]
    file_size_bytes: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class VideoDownloadHistoryResponse(BaseModel):
    items: list[VideoDownloadResponse]
    total: int
    page: int
    page_size: int


class VideoDownloadDetailResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    url: str
    platform: str
    download_type: str
    title: Optional[str]
    status: str
    file_path: Optional[str]
    thumbnail_url: Optional[str]
    duration_seconds: Optional[int]
    file_size_bytes: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
