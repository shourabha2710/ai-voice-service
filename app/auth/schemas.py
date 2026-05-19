import uuid
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password must be 8-128 characters (bcrypt 72-byte limit)"
    )
    password_confirm: str = Field(
        ...,
        min_length=8,
        max_length=128
    )
    full_name: str = Field(..., min_length=2)

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "strongpassword123",
                "password_confirm": "strongpassword123",
                "full_name": "John Doe"
            }
        }

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class GoogleLogin(BaseModel):
    token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    avatar_url: str | None = None
    auth_provider: str = "local"
    plan: str
    credits: int
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True
