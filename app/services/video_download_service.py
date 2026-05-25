import uuid
import asyncio
import os
import ipaddress
import time
from pathlib import Path
from datetime import datetime
from typing import Tuple
from urllib.parse import urlparse
from loguru import logger

from app.config.settings import settings
from app.db.repositories.video import VideoDownloadRepository
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal
from app.utils.url_utils import sanitize_url_for_logging


class VideoDownloadService:
    """Service for managing video/audio downloads from YouTube and Instagram."""

    # Storage path for downloaded videos
    STORAGE_PATH = Path("storage/downloaded-videos").resolve()

    # Supported platforms
    SUPPORTED_PLATFORMS = {
        "youtube.com": "youtube",
        "youtu.be": "youtube",
        "instagram.com": "instagram",
    }

    def __init__(self):
        self.STORAGE_PATH.mkdir(parents=True, exist_ok=True)
        logger.info(f"Video download storage initialized: {self.STORAGE_PATH}")
        # Semaphore for limiting concurrent downloads
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_VIDEO_DOWNLOADS)

    def validate_url(self, url: str) -> Tuple[bool, str]:
        """
        Validate URL is from a supported platform.
        Returns: (is_valid, platform_or_error_message)
        """
        try:
            if not url or not url.strip():
                return False, "URL cannot be empty"

            parsed = urlparse(url)
            hostname = (parsed.hostname or "").lower()

            # Reject disallowed schemes
            if parsed.scheme in ["file", "ftp"]:
                return False, f"Scheme '{parsed.scheme}' not allowed"

            # Reject explicit localhost
            if hostname == "localhost" or hostname.endswith('.localhost'):
                return False, "Localhost URLs are not allowed"

            # If hostname is an IP address, enforce private/loopback/link-local checks
            try:
                ip = ipaddress.ip_address(hostname)
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    return False, "Private or loopback IP addresses are not allowed"
            except ValueError:
                # Not a literal IP address — continue with hostname checks
                # Prevent obvious IPv4 dotted forms embedded in netloc
                if hostname.startswith("127.") or hostname.startswith("10.") or hostname.startswith("192.168.") or hostname.startswith("172."):
                    return False, "Private/local URLs not allowed"

            # Check against supported platforms by hostname
            for platform_domain, platform_name in self.SUPPORTED_PLATFORMS.items():
                if platform_domain in hostname:
                    # Additional validation for Instagram (must have /reel/ or /p/)
                    if platform_name == "instagram":
                        if "/reel/" not in url and "/p/" not in url:
                            return False, "Only Instagram reels and posts are supported"
                    return True, platform_name

            return False, "Unsupported platform (only YouTube and Instagram supported)"

        except Exception as e:
            logger.error(f"URL validation error: {e}")
            return False, f"Invalid URL format: {e}"

    async def download_media(
        self,
        download_id: uuid.UUID,
        url: str,
        download_type: str,
    ) -> None:
        """
        Background task to download media.
        Updates database with progress and results.
        """
        sanitized = sanitize_url_for_logging(url)
        logger.info(
            f"Starting download: {download_id}, type={download_type}, url={sanitized}"
        )

        # Limit concurrency
        async with self._semaphore:
            try:
                # Get fresh session for background task
                async with AsyncSessionLocal() as session:
                    repo = VideoDownloadRepository(session)

                    # Update status to downloading
                    await repo.update_status(download_id, "downloading")
                    await session.commit()

                    # Create download directory
                    download_dir = self.STORAGE_PATH / str(download_id)
                    download_dir.mkdir(parents=True, exist_ok=True)

                    logger.info(f"Download directory created: {download_dir}")

                    loop = asyncio.get_event_loop()

                    # Try to fetch metadata first to enforce size caps
                    try:
                        info = await loop.run_in_executor(
                            None, self._fetch_info_with_ytdlp, url
                        )
                    except Exception as meta_err:
                        info = None
                        logger.warning(f"Failed to fetch metadata for {download_id}: {meta_err}")

                    # Early size enforcement using metadata if available
                    try:
                        if info:
                            filesize = info.get("filesize") or info.get("filesize_approx")
                            # If not present, try to sum format sizes
                            if not filesize:
                                formats = info.get("formats") or []
                                for f in formats:
                                    if f.get("filesize"):
                                        filesize = f.get("filesize")
                                        break

                            if filesize and filesize > settings.MAX_VIDEO_SIZE_MB * 1024 * 1024:
                                msg = f"File too large: {filesize} bytes exceeds limit"
                                logger.warning(msg)
                                await repo.update_status(download_id, "failed", error_message=msg[:1024])
                                await session.commit()
                                # cleanup any created dir
                                self._cleanup_partial(download_dir)
                                return
                    except Exception as e:
                        logger.warning(f"Error during size enforcement for {download_id}: {e}")

                    # Download with retries and timeout
                    max_retries = getattr(settings, "MAX_RETRY_COUNT", 3)
                    attempt = 0
                    last_exc: Exception | None = None
                    while attempt <= max_retries:
                        attempt += 1
                        try:
                            timeout_seconds = settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60
                            logger.info(f"Starting yt-dlp attempt {attempt} for {download_id} (timeout={timeout_seconds}s)")
                            info = await asyncio.wait_for(
                                loop.run_in_executor(
                                    None,
                                    self._download_with_ytdlp,
                                    url,
                                    download_type,
                                    str(download_dir),
                                ),
                                timeout=timeout_seconds,
                            )

                            if not info:
                                raise Exception("yt-dlp returned no info")

                            # Success
                            break

                        except asyncio.TimeoutError as te:
                            last_exc = te
                            logger.error(f"Download timeout for {download_id}: {te}")
                            # cleanup partials and mark failed
                            await repo.update_status(download_id, "failed", error_message="Download timed out")
                            await session.commit()
                            self._cleanup_partial(download_dir)
                            return
                        except Exception as e:
                            last_exc = e
                            # Determine if retryable by message
                            msg = str(e).lower()
                            retryable = (
                                "http" in msg
                                or "timed out" in msg
                                or "temporary" in msg
                                or "timeout" in msg
                                or "503" in msg
                                or "502" in msg
                            )
                            if attempt > max_retries or not retryable:
                                logger.error(f"Download failed for {download_id}: {e}")
                                await repo.update_status(download_id, "failed", error_message=str(e)[:1024])
                                await session.commit()
                                self._cleanup_partial(download_dir)
                                return
                            else:
                                backoff = min(30, 2 ** attempt)
                                logger.info(f"Retrying download {download_id} after {backoff}s (attempt {attempt})")
                                await asyncio.sleep(backoff)

                    # After download, validate file and finalize
                    try:
                        files = [f for f in download_dir.iterdir() if f.is_file()]
                        if not files:
                            raise Exception("No file found after download")

                        # Choose the largest file in directory as the downloaded artifact
                        file_path = max(files, key=lambda p: p.stat().st_size)
                        file_size = file_path.stat().st_size

                        # Resolve both paths before relative_to to avoid
                        # "is not in the subpath of BASE_DIR" on Windows
                        file_resolved = file_path.resolve()
                        cwd_resolved = Path.cwd().resolve()
                        base_dir_resolved = self.STORAGE_PATH.resolve()
                        relative_path = str(file_resolved.relative_to(cwd_resolved))

                        logger.info(
                            f"Download finalization: "
                            f"download_id={download_id} "
                            f"absolute_path={file_resolved} "
                            f"base_dir={base_dir_resolved} "
                            f"cwd={cwd_resolved} "
                            f"relative_path={relative_path} "
                            f"public_url=/api/v1/videos/{download_id}/file"
                        )

                        # Post-download size enforcement
                        if file_size > settings.MAX_VIDEO_SIZE_MB * 1024 * 1024:
                            msg = f"Downloaded file exceeds size limit: {file_size} bytes"
                            logger.warning(msg)
                            await repo.update_status(download_id, "failed", error_message=msg[:1024])
                            await session.commit()
                            self._cleanup_partial(download_dir)
                            return

                        # Update status to completed
                        await repo.update_status(
                            download_id,
                            status="completed",
                            title=info.get("title", "download") if info else None,
                            file_path=relative_path,
                            thumbnail_url=info.get("thumbnail") if info else None,
                            duration_seconds=info.get("duration") if info else None,
                            file_size_bytes=file_size,
                        )
                        await session.commit()
                        logger.info(f"Download metadata updated: {download_id}")

                    except Exception as final_err:
                        logger.error(f"Finalizing download failed for {download_id}: {final_err}")
                        await repo.update_status(download_id, "failed", error_message=str(final_err)[:1024])
                        await session.commit()
                        self._cleanup_partial(download_dir)

            except Exception as e:
                logger.exception(f"Unexpected error in download task {download_id}: {e}")
                try:
                    async with AsyncSessionLocal() as session:
                        repo = VideoDownloadRepository(session)
                        error_msg = str(e)[:1024]
                        await repo.update_status(download_id, "failed", error_message=error_msg)
                        await session.commit()
                except Exception as db_error:
                    logger.error(f"Failed to update download status to failed: {db_error}")

    def _download_with_ytdlp(
        self, url: str, download_type: str, output_dir: str
    ) -> dict | None:
        """
        Blocking yt-dlp download operation.
        Runs in executor thread pool.
        """
        try:
            import yt_dlp

            # Configure yt-dlp options
            if download_type == "audio":
                ydl_opts = {
                    "format": "bestaudio/best",
                    "postprocessors": [
                        {
                            "key": "FFmpegExtractAudio",
                            "preferredcodec": "mp3",
                            "preferredquality": "192",
                        }
                    ],
                    "outtmpl": os.path.join(output_dir, "%(title)s"),
                    "quiet": False,
                    "no_warnings": False,
                    "socket_timeout": settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60,
                }
            else:  # video
                ydl_opts = {
                    "format": "best",
                    "outtmpl": os.path.join(output_dir, "%(title)s"),
                    "quiet": False,
                    "no_warnings": False,
                    "socket_timeout": settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60,
                }

            logger.info(f"yt-dlp options: {ydl_opts}")

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                logger.info(f"Starting yt-dlp download")
                info = ydl.extract_info(url, download=True)
                logger.info(f"Download completed, info: {info.get('title', 'N/A')}")
                return info

        except Exception as e:
            logger.error(f"yt-dlp download error: {e}")
            return None

    def _fetch_info_with_ytdlp(self, url: str) -> dict | None:
        """Blocking metadata fetch using yt-dlp (runs in executor)."""
        try:
            import yt_dlp

            ydl_opts = {"skip_download": True, "quiet": True}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info
        except Exception as e:
            logger.debug(f"_fetch_info_with_ytdlp error: {e}")
            return None

    def _cleanup_partial(self, download_dir: Path) -> None:
        """Remove partial or failed download files and directories."""
        try:
            if not download_dir.exists():
                return
            for item in list(download_dir.iterdir()):
                try:
                    if item.is_file():
                        # remove part/tmp files first
                        if item.suffix in (".part", ".tmp") or item.name.endswith(".part"):
                            item.unlink(missing_ok=True)
                        else:
                            # remove any leftover files only when cleaning up failed downloads
                            item.unlink(missing_ok=True)
                    elif item.is_dir():
                        import shutil

                        shutil.rmtree(item)
                except Exception:
                    pass
            # finally remove the directory itself
            try:
                import shutil

                shutil.rmtree(download_dir)
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"_cleanup_partial error for {download_dir}: {e}")


# Global singleton instance
video_download_service = VideoDownloadService()
