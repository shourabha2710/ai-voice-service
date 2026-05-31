import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VideoDownload(Base):
    __tablename__ = "video_downloads"

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
    url: Mapped[str] = mapped_column(
        String(2048),
        nullable=False
    )
    platform: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )
    download_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )
    title: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )
    file_path: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    thumbnail_url: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    file_size_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    progress_percent: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    downloaded_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    total_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    download_speed: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )
    eta_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
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
        Index("ix_video_downloads_user_id", "user_id"),
        Index("ix_video_downloads_created_at", "created_at"),
        Index("ix_video_downloads_status", "status"),
        Index("ix_video_downloads_user_id_created_at", "user_id", "created_at"),
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="video_downloads"
    )
