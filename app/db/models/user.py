import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False
    )
    password_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    avatar_url: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    auth_provider: Mapped[str] = mapped_column(
        String(50),
        default="local",
        nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False
    )
    plan: Mapped[str] = mapped_column(
        String(50),
        default="free",
        nullable=False
    )
    credits: Mapped[int] = mapped_column(
        Integer,
        default=100,
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        server_default=text("timezone('utc', now())")
    )

    # Relationships
    audio_generations: Mapped[list["AudioGeneration"]] = relationship(
        "AudioGeneration",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    image_generations: Mapped[list["ImageGeneration"]] = relationship(
        "ImageGeneration",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    video_downloads: Mapped[list["VideoDownload"]] = relationship(
        "VideoDownload",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    video_generations: Mapped[list["VideoGeneration"]] = relationship(
        "VideoGeneration",
        back_populates="user",
        cascade="all, delete-orphan"
    )
