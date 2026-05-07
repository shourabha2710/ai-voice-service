from typing import Optional, List
from pydantic import BaseModel, Field, validator

class TTSRequest(BaseModel):
    text: str = Field(..., description="The text to convert to speech", min_length=1)
    voice: str = Field(default="en-US-GuyNeural", description="Voice ID from edge-tts")
    rate: str = Field(default="+0%", description="Speech rate (e.g., '+0%', '-10%', '+20%')")
    pitch: str = Field(default="+0Hz", description="Speech pitch (e.g., '+0Hz', '-5Hz', '+10Hz')")
    download_filename: Optional[str] = Field(None, description="Optional filename for the downloaded audio")

    @validator('text')
    def text_length_check(cls, v):
        from app.config.settings import settings
        if len(v) > settings.MAX_TEXT_LENGTH:
            raise ValueError(f"Text length exceeds maximum of {settings.MAX_TEXT_LENGTH} characters")
        return v

class VoiceInfo(BaseModel):
    ShortName: str
    Gender: str
    Locale: str
    ContentCategories: List[str]
    VoiceTag: dict

class HealthResponse(BaseModel):
    status: str
    version: str
    service: str
