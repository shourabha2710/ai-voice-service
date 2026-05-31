import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ImageGeneration(Base):
    __tablename__ = "image_generations"

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
        nullable=False
    )
    image_path: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    provider: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )
    generation_time_seconds: Mapped[float | None] = mapped_column(
        Float,
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
        Index("ix_image_generations_user_id", "user_id"),
        Index("ix_image_generations_created_at", "created_at"),
        Index("ix_image_generations_status", "status"),
        Index("ix_image_generations_user_id_created_at", "user_id", "created_at"),
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="image_generations"
    )
