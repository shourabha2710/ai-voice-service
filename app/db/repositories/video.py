import uuid
from datetime import datetime
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.video import VideoDownload


class VideoDownloadRepository:
    """Repository for video download database operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: uuid.UUID,
        url: str,
        platform: str,
        download_type: str
    ) -> VideoDownload:
        """Create a new pending video download record."""
        download = VideoDownload(
            user_id=user_id,
            url=url,
            platform=platform,
            download_type=download_type,
            status="pending"
        )
        self.session.add(download)
        await self.session.flush()
        return download

    async def get_by_id(self, download_id: uuid.UUID) -> VideoDownload | None:
        """Get video download by ID."""
        result = await self.session.execute(
            select(VideoDownload).where(VideoDownload.id == download_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_and_user(
        self,
        download_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> VideoDownload | None:
        """Get video download by ID, ensuring it belongs to the user."""
        result = await self.session.execute(
            select(VideoDownload).where(
                (VideoDownload.id == download_id) &
                (VideoDownload.user_id == user_id)
            )
        )
        return result.scalar_one_or_none()

    async def get_user_downloads(
        self,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 20,
        status: str | None = None
    ) -> tuple[list[VideoDownload], int]:
        """Get paginated video downloads for a user."""
        query = select(VideoDownload).where(VideoDownload.user_id == user_id)

        if status:
            query = query.where(VideoDownload.status == status)

        # Get total count
        count_result = await self.session.execute(
            select(func.count(VideoDownload.id)).where(
                VideoDownload.user_id == user_id
            )
        )
        total = count_result.scalar()

        # Get paginated results, ordered by newest first
        query = query.order_by(desc(VideoDownload.created_at))
        query = query.offset(skip).limit(limit)

        result = await self.session.execute(query)
        downloads = result.scalars().all()

        return downloads, total

    async def update_status(
        self,
        download_id: uuid.UUID,
        status: str,
        title: str | None = None,
        file_path: str | None = None,
        thumbnail_url: str | None = None,
        duration_seconds: int | None = None,
        file_size_bytes: int | None = None,
        error_message: str | None = None
    ) -> VideoDownload | None:
        """Update download status and metadata."""
        download = await self.get_by_id(download_id)
        if not download:
            return None

        download.status = status
        if title:
            download.title = title
        if file_path:
            download.file_path = file_path
        if thumbnail_url:
            download.thumbnail_url = thumbnail_url
        if duration_seconds is not None:
            download.duration_seconds = duration_seconds
        if file_size_bytes is not None:
            download.file_size_bytes = file_size_bytes
        if error_message:
            download.error_message = error_message
        if status == "completed":
            download.completed_at = datetime.utcnow()

        self.session.add(download)
        await self.session.flush()
        return download

    async def delete_by_id_and_user(
        self,
        download_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> bool:
        """Delete video download if it belongs to the user."""
        download = await self.get_by_id_and_user(download_id, user_id)
        if not download:
            return False

        await self.session.delete(download)
        await self.session.flush()
        return True

    async def delete_old_downloads(
        self,
        cutoff_timestamp: float
    ) -> int:
        """Delete completed downloads older than cutoff timestamp."""
        result = await self.session.execute(
            select(VideoDownload).where(
                (VideoDownload.completed_at.isnot(None)) &
                (VideoDownload.created_at < datetime.fromtimestamp(cutoff_timestamp)) &
                ((VideoDownload.status == "completed") | (VideoDownload.status == "failed"))
            )
        )
        downloads = result.scalars().all()
        
        for download in downloads:
            await self.session.delete(download)
        
        await self.session.flush()
        return len(downloads)
