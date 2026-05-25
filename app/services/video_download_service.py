import uuid
import asyncio
import os
import ipaddress
import time
import threading
from pathlib import Path
from datetime import datetime
from typing import Tuple, Callable
from urllib.parse import urlparse
from loguru import logger

from app.config.settings import settings
from app.db.repositories.video import VideoDownloadRepository
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal
from app.utils.url_utils import sanitize_url_for_logging


def _format_bytes(num: int) -> str:
    """Format bytes to human-readable string."""
    if num == 0:
        return "0B"
    for unit in ("B", "KB", "MB", "GB"):
        if abs(num) < 1024:
            return f"{num:.1f}{unit}"
        num //= 1024
    return f"{num:.1f}TB"


class DownloadCancelledError(Exception):
    """Raised when a download is cancelled by the user."""
    pass


class VideoDownloadService:
    """Service for managing video/audio downloads from YouTube and Instagram."""

    STORAGE_PATH = Path("storage/downloaded-videos").resolve()

    SUPPORTED_PLATFORMS = {
        "youtube.com": "youtube",
        "youtu.be": "youtube",
        "instagram.com": "instagram",
    }

    def __init__(self):
        self.STORAGE_PATH.mkdir(parents=True, exist_ok=True)
        logger.info(f"Video download storage initialized: {self.STORAGE_PATH}")
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_VIDEO_DOWNLOADS)
        self._cancel_flags: dict[uuid.UUID, threading.Event] = {}
        self._progress_cache: dict[uuid.UUID, dict] = {}
        self._lock = threading.Lock()

    def _set_cancel_flag(self, download_id: uuid.UUID) -> None:
        with self._lock:
            event = self._cancel_flags.get(download_id)
            if event is None:
                event = threading.Event()
                self._cancel_flags[download_id] = event
            event.set()

    def _check_cancelled(self, download_id: uuid.UUID) -> None:
        with self._lock:
            event = self._cancel_flags.get(download_id)
            if event and event.is_set():
                raise DownloadCancelledError("Download cancelled by user")

    def _clear_cancel_flag(self, download_id: uuid.UUID) -> None:
        with self._lock:
            self._cancel_flags.pop(download_id, None)

    def _make_progress_hook(self, download_id: uuid.UUID):
        """Create a progress_hook callback for yt-dlp with detailed logging."""
        last_logged_pct = -1

        def progress_hook(d: dict):
            self._check_cancelled(download_id)
            try:
                if d.get("status") == "downloading":
                    pct_str = d.get("_percent_str", "0").strip().replace("%", "")
                    try:
                        pct = int(float(pct_str))
                    except (ValueError, TypeError):
                        pct = 0

                    downloaded = int(d.get("downloaded_bytes", 0) or 0)
                    total = int(
                        d.get("total_bytes", 0)
                        or d.get("total_bytes_estimate", 0)
                        or 0
                    )
                    speed = float(d.get("speed", 0) or 0)
                    eta = int(d.get("eta", 0) or 0)

                    info = {
                        "progress_percent": pct,
                        "downloaded_bytes": downloaded,
                        "total_bytes": total,
                        "download_speed": speed,
                        "eta_seconds": eta,
                    }

                    with self._lock:
                        self._progress_cache[download_id] = info

                    nonlocal last_logged_pct
                    if pct != last_logged_pct and (pct % 10 == 0 or pct == last_logged_pct + 1):
                        last_logged_pct = pct
                        logger.info(
                            f"Progress [{download_id}]: {pct}% "
                            f"({_format_bytes(downloaded)}/{_format_bytes(total)}, "
                            f"{_format_bytes(int(speed))}/s, ETA: {eta}s)"
                        )

                    self._check_cancelled(download_id)

                elif d.get("status") == "finished":
                    with self._lock:
                        self._progress_cache[download_id] = {
                            "progress_percent": 100,
                            "downloaded_bytes": int(d.get("total_bytes", 0) or d.get("downloaded_bytes", 0) or 0),
                            "total_bytes": int(d.get("total_bytes", 0) or d.get("downloaded_bytes", 0) or 0),
                            "download_speed": 0,
                            "eta_seconds": 0,
                        }
                    logger.info(f"Download finished (post-processing): {download_id}")

                elif d.get("status") == "error":
                    logger.error(f"yt-dlp reported error for {download_id}: {d.get('error', 'unknown error')}")

            except Exception as e:
                logger.error(f"Progress hook error for {download_id}: {e}")

        return progress_hook

    def get_progress(self, download_id: uuid.UUID) -> dict | None:
        with self._lock:
            return self._progress_cache.get(download_id)

    def clear_progress(self, download_id: uuid.UUID) -> None:
        with self._lock:
            self._progress_cache.pop(download_id, None)

    async def _periodic_progress_flush(
        self,
        download_id: uuid.UUID,
        interval: float = 1.0,
    ):
        """Periodically flush cached progress to database."""
        logger.info(f"Progress flush task started for {download_id} (interval={interval}s)")
        while True:
            try:
                await asyncio.sleep(interval)
                progress = self.get_progress(download_id)
                if not progress or progress.get("progress_percent", 0) < 0:
                    continue

                async with AsyncSessionLocal() as flush_session:
                    try:
                        repo = VideoDownloadRepository(flush_session)
                        await repo.update_progress(
                            download_id,
                            progress_percent=progress.get("progress_percent"),
                            downloaded_bytes=progress.get("downloaded_bytes"),
                            total_bytes=progress.get("total_bytes"),
                            download_speed=progress.get("download_speed"),
                            eta_seconds=progress.get("eta_seconds"),
                        )
                        await flush_session.commit()
                        pct = progress.get("progress_percent", 0)
                        logger.debug(
                            f"DB progress flushed for {download_id}: {pct}% "
                            f"({progress.get('downloaded_bytes', 0)}/"
                            f"{progress.get('total_bytes', 0)} bytes, "
                            f"{progress.get('download_speed', 0)} B/s, "
                            f"ETA: {progress.get('eta_seconds', 0)}s)"
                        )
                    except Exception as db_err:
                        await flush_session.rollback()
                        logger.error(f"DB flush error for {download_id}: {db_err}")

            except asyncio.CancelledError:
                logger.info(f"Progress flush task cancelled for {download_id}")
                break
            except Exception as e:
                logger.error(f"Unexpected error in progress flush for {download_id}: {e}")

    async def cancel_download(self, download_id: uuid.UUID) -> bool:
        """Cancel an active download by its ID."""
        logger.info(f"Cancelling download: {download_id}")
        self._set_cancel_flag(download_id)

        try:
            async with AsyncSessionLocal() as session:
                repo = VideoDownloadRepository(session)
                download = await repo.get_by_id(download_id)
                if download and download.status in ("pending", "downloading"):
                    await repo.update_status(
                        download_id,
                        status="cancelled",
                        error_message="Download cancelled by user"
                    )
                    await session.commit()
                    self.clear_progress(download_id)
                    self._cleanup_partial(self.STORAGE_PATH / str(download_id))
                    self._clear_cancel_flag(download_id)
                    logger.info(f"Download cancelled and cleaned up: {download_id}")
                    return True
                self._clear_cancel_flag(download_id)
                return False
        except Exception as e:
            self._clear_cancel_flag(download_id)
            logger.error(f"Error cancelling download {download_id}: {e}")
            return False

    def validate_url(self, url: str) -> Tuple[bool, str]:
        """Validate URL is from a supported platform."""
        try:
            if not url or not url.strip():
                return False, "URL cannot be empty"

            parsed = urlparse(url)
            hostname = (parsed.hostname or "").lower()

            if parsed.scheme in ["file", "ftp"]:
                return False, f"Scheme '{parsed.scheme}' not allowed"

            if hostname == "localhost" or hostname.endswith('.localhost'):
                return False, "Localhost URLs are not allowed"

            try:
                ip = ipaddress.ip_address(hostname)
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    return False, "Private or loopback IP addresses are not allowed"
            except ValueError:
                if hostname.startswith("127.") or hostname.startswith("10.") or hostname.startswith("192.168.") or hostname.startswith("172."):
                    return False, "Private/local URLs not allowed"

            for platform_domain, platform_name in self.SUPPORTED_PLATFORMS.items():
                if platform_domain in hostname:
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
        """Background task to download media with progress tracking."""
        sanitized = sanitize_url_for_logging(url)
        logger.info(f"Starting download: {download_id}, type={download_type}, url={sanitized}")

        progress_hook = self._make_progress_hook(download_id)
        flush_task: asyncio.Task | None = None

        async with self._semaphore:
            try:
                async with AsyncSessionLocal() as session:
                    repo = VideoDownloadRepository(session)

                    await repo.update_status(download_id, "downloading")
                    await session.commit()

                    download_dir = self.STORAGE_PATH / str(download_id)
                    download_dir.mkdir(parents=True, exist_ok=True)

                    logger.info(f"Download directory created: {download_dir}")

                    flush_task = asyncio.create_task(
                        self._periodic_progress_flush(download_id, interval=1.0)
                    )

                    loop = asyncio.get_event_loop()

                    try:
                        info = await loop.run_in_executor(
                            None, self._fetch_info_with_ytdlp, url
                        )
                    except Exception as meta_err:
                        info = None
                        logger.warning(f"Failed to fetch metadata for {download_id}: {meta_err}")

                    try:
                        if info:
                            filesize = info.get("filesize") or info.get("filesize_approx")
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
                                self._cleanup_partial(download_dir)
                                return
                    except Exception as e:
                        logger.warning(f"Error during size enforcement for {download_id}: {e}")

                    max_retries = getattr(settings, "MAX_RETRY_COUNT", 3)
                    attempt = 0
                    last_exc: Exception | None = None
                    while attempt <= max_retries:
                        attempt += 1
                        try:
                            self._check_cancelled(download_id)
                            timeout_seconds = settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60
                            logger.info(f"Starting yt-dlp attempt {attempt} for {download_id} (timeout={timeout_seconds}s)")

                            info = await asyncio.wait_for(
                                loop.run_in_executor(
                                    None,
                                    self._download_with_ytdlp,
                                    url,
                                    download_type,
                                    str(download_dir),
                                    progress_hook,
                                ),
                                timeout=timeout_seconds,
                            )

                            if not info:
                                raise Exception("yt-dlp returned no info")
                            break

                        except DownloadCancelledError:
                            logger.info(f"Download cancelled by user: {download_id}")
                            await repo.update_status(download_id, "cancelled", error_message="Download cancelled by user")
                            await session.commit()
                            self._cleanup_partial(download_dir)
                            return

                        except asyncio.TimeoutError as te:
                            last_exc = te
                            logger.error(f"Download timeout for {download_id}: {te}")
                            await repo.update_status(download_id, "failed", error_message="Download timed out")
                            await session.commit()
                            self._cleanup_partial(download_dir)
                            return

                        except Exception as e:
                            last_exc = e
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

                    try:
                        self._check_cancelled(download_id)
                        files = [f for f in download_dir.iterdir() if f.is_file()]
                        if not files:
                            raise Exception("No file found after download")

                        file_path = max(files, key=lambda p: p.stat().st_size)
                        file_size = file_path.stat().st_size

                        file_resolved = file_path.resolve()
                        cwd_resolved = Path.cwd().resolve()
                        relative_path = str(file_resolved.relative_to(cwd_resolved))

                        logger.info(
                            f"Download finalization: "
                            f"download_id={download_id} "
                            f"relative_path={relative_path} "
                            f"file_size={file_size}"
                        )

                        if file_size > settings.MAX_VIDEO_SIZE_MB * 1024 * 1024:
                            msg = f"Downloaded file exceeds size limit: {file_size} bytes"
                            logger.warning(msg)
                            await repo.update_status(download_id, "failed", error_message=msg[:1024])
                            await session.commit()
                            self._cleanup_partial(download_dir)
                            return

                        await repo.update_status(
                            download_id,
                            status="completed",
                            title=info.get("title", "download") if info else None,
                            file_path=relative_path,
                            thumbnail_url=info.get("thumbnail") if info else None,
                            duration_seconds=info.get("duration") if info else None,
                            file_size_bytes=file_size,
                        )

                        await repo.update_progress(
                            download_id,
                            progress_percent=100,
                            downloaded_bytes=file_size,
                            total_bytes=file_size,
                            download_speed=0,
                            eta_seconds=0,
                        )
                        await session.commit()
                        logger.info(f"Download completed: {download_id}")

                    except DownloadCancelledError:
                        logger.info(f"Download cancelled during finalization: {download_id}")
                        await repo.update_status(download_id, "cancelled", error_message="Download cancelled by user")
                        await session.commit()
                        self._cleanup_partial(download_dir)

                    except Exception as final_err:
                        logger.error(f"Finalizing download failed for {download_id}: {final_err}")
                        await repo.update_status(download_id, "failed", error_message=str(final_err)[:1024])
                        await session.commit()
                        self._cleanup_partial(download_dir)

            except DownloadCancelledError:
                logger.info(f"Download cancelled: {download_id}")
                try:
                    async with AsyncSessionLocal() as session:
                        repo = VideoDownloadRepository(session)
                        await repo.update_status(download_id, "cancelled", error_message="Download cancelled by user")
                        await session.commit()
                except Exception as db_error:
                    logger.error(f"Failed to update cancelled status: {db_error}")

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

            finally:
                if flush_task and not flush_task.done():
                    flush_task.cancel()
                    try:
                        await flush_task
                    except asyncio.CancelledError:
                        pass
                self._clear_cancel_flag(download_id)
                self.clear_progress(download_id)

    def _download_with_ytdlp(
        self, url: str, download_type: str, output_dir: str, progress_hook: Callable | None = None
    ) -> dict | None:
        """Blocking yt-dlp download operation with progress hook."""
        try:
            import yt_dlp

            base_opts = {
                "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
                "quiet": False,
                "no_warnings": False,
                "socket_timeout": settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60,
            }

            if progress_hook:
                base_opts["progress_hooks"] = [progress_hook]

            if download_type == "audio":
                ydl_opts = {
                    **base_opts,
                    "format": "bestaudio/best",
                    "postprocessors": [
                        {
                            "key": "FFmpegExtractAudio",
                            "preferredcodec": "mp3",
                            "preferredquality": "192",
                        }
                    ],
                }
            else:
                ydl_opts = {
                    **base_opts,
                    "format": "best",
                }

            logger.info(f"Starting yt-dlp download with progress hooks")

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                logger.info(f"Download completed: {info.get('title', 'N/A')}")
                return info

        except DownloadCancelledError:
            raise
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
                        if item.suffix in (".part", ".tmp") or item.name.endswith(".part"):
                            item.unlink(missing_ok=True)
                        else:
                            item.unlink(missing_ok=True)
                    elif item.is_dir():
                        import shutil
                        shutil.rmtree(item)
                except Exception:
                    pass
            try:
                import shutil
                shutil.rmtree(download_dir)
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"_cleanup_partial error for {download_dir}: {e}")


video_download_service = VideoDownloadService()
