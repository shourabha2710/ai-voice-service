import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VideoGeneration(Base):
    __tablename__ = "video_generations"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    prompt: Mapped[str] = mapped_column(
        String(2048),
        nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
        server_default=text("'pending'")
    )
    video_path: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    thumbnail_path: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    aspect_ratio: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="16:9",
        server_default=text("'16:9'")
    )
    resolution: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="720p",
        server_default=text("'720p'")
    )
    progress_percent: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
        server_default=text("0")
    )
    error_message: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        server_default=text("timezone('utc', now())")
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    __table_args__ = (
        Index("ix_video_generations_user_id", "user_id"),
        Index("ix_video_generations_created_at", "created_at"),
        Index("ix_video_generations_user_id_created_at", "user_id", "created_at"),
        Index("ix_video_generations_status", "status"),
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="video_generations"
    )
