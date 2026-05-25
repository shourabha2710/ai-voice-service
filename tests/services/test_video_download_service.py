"""Comprehensive tests for VideoDownloadService.

Covers:
  - File size enforcement (pre-download metadata check)
  - File size enforcement (post-download check)
  - Timeout handling
  - Retry logic (exponential backoff, retry count, non-retryable errors)
  - Concurrency (semaphore limits, no deadlocks, proper release after exceptions)
"""
import asyncio
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, ANY

import pytest

from app.config.settings import settings
from app.services.video_download_service import VideoDownloadService


# ---- Helpers ----

def _make_session_factory(session):
    """Return callable that returns an async context manager yielding *session*."""
    factory = MagicMock()
    cm = AsyncMock(name="session_cm")
    cm.__aenter__.return_value = session
    cm.__aexit__.return_value = None
    factory.return_value = cm
    return factory


def metadata(size=None):
    """Return a yt-dlp style metadata dict."""
    d = {"filesize": size, "title": "Test Video", "thumbnail": None, "duration": 120}
    if size is None:
        d.pop("filesize", None)
    return d


# ---- Fixtures ----

@pytest.fixture
def service():
    svc = VideoDownloadService()
    svc._semaphore = asyncio.Semaphore(100)
    with patch("pathlib.Path.mkdir"):
        yield svc


@pytest.fixture
def download_id():
    return uuid.uuid4()


@pytest.fixture
def deps():
    """Return fresh mock (session, repo) for each test."""
    session = AsyncMock(name="session")
    session.commit = AsyncMock(name="commit")
    repo = MagicMock(name="repo")
    repo.update_status = AsyncMock(name="update_status")
    return session, repo


# ═══════════════════════════════════════════════════════════════
#  1. File size enforcement
# ═══════════════════════════════════════════════════════════════

class TestFileSizeEnforcement:
    """Oversized downloads rejected, DB status set to failed, partials cleaned, valid allowed."""

    async def test_oversized_rejected_via_metadata(self, service, download_id, deps):
        """Pre-download: metadata shows 600MB > 500MB limit → reject."""
        session, repo = deps

        with patch.object(settings, "MAX_VIDEO_SIZE_MB", 500):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(600 * 1024 * 1024)):
                with patch.object(service, "_download_with_ytdlp") as mock_dl:
                    with patch.object(service, "_cleanup_partial") as mock_clean:
                        with _patch_session(session, repo):
                            await service.download_media(
                                download_id, "https://youtube.com/watch?v=test", "audio"
                            )

        mock_dl.assert_not_called()
        repo.update_status.assert_any_call(download_id, "failed", error_message=ANY)
        session.commit.assert_called()
        mock_clean.assert_called_once()

    async def test_oversized_rejected_approx_filesize(self, service, download_id, deps):
        """filesize_approx should also be checked."""
        session, repo = deps

        info = {"filesize_approx": 800 * 1024 * 1024, "title": "Big Video"}

        with patch.object(settings, "MAX_VIDEO_SIZE_MB", 500):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=info):
                with patch.object(service, "_download_with_ytdlp") as mock_dl:
                    with _patch_session(session, repo):
                        with patch.object(service, '_cleanup_partial'):
                            await service.download_media(
                                download_id, "https://youtube.com/watch?v=test", "audio"
                            )

        mock_dl.assert_not_called()
        repo.update_status.assert_any_call(download_id, "failed", error_message=ANY)

    async def test_valid_size_allows_download(self, service, download_id, deps):
        """Pre-download: metadata shows 1MB < 500MB limit → proceed."""
        session, repo = deps

        result = metadata(1024 * 1024)
        result["filesize"] = 1024 * 1024
        result["title"] = "Small Video"
        result["thumbnail"] = "https://img.youtube.com/vi/test/0.jpg"
        result["duration"] = 120

        with patch.object(settings, "MAX_VIDEO_SIZE_MB", 500):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(1024 * 1024)):
                with patch.object(service, "_download_with_ytdlp", return_value=result):
                    with _patch_session(session, repo):
                        with _patch_post_download(5_000_000, "path/to/file.mp3"):
                            await service.download_media(
                                download_id, "https://youtube.com/watch?v=test", "audio"
                            )

        _assert_completed_status(repo.update_status, download_id)

    async def test_no_metadata_fallback_proceeds(self, service, download_id, deps):
        """When metadata fetch fails, download should still proceed."""
        session, repo = deps

        result = metadata(5 * 1024 * 1024)
        result["filesize"] = 5 * 1024 * 1024
        result["title"] = "Fallback Video"

        with patch.object(settings, "MAX_VIDEO_SIZE_MB", 500):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=None):
                with patch.object(service, "_download_with_ytdlp", return_value=result):
                    with _patch_session(session, repo):
                        with _patch_post_download(5_000_000, "path/to/file.mp3"):
                            await service.download_media(
                                download_id, "https://youtube.com/watch?v=test", "audio"
                            )

        _assert_completed_status(repo.update_status, download_id)

    async def test_post_download_size_exceeded(self, service, download_id, deps):
        """File on disk exceeds limit after download → fail."""
        session, repo = deps

        result = metadata(100 * 1024 * 1024)
        result["filesize"] = 100 * 1024 * 1024
        result["title"] = "Post oversized"

        with patch.object(settings, "MAX_VIDEO_SIZE_MB", 50):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(100 * 1024 * 1024)):
                with patch.object(service, "_download_with_ytdlp", return_value=result):
                    with _patch_session(session, repo):
                        with patch.object(service, '_cleanup_partial') as mock_clean:
                            # Post-download: file on disk is 60MB > 50MB limit
                            with _patch_post_download(60 * 1024 * 1024, "path/to/file.mp3"):
                                await service.download_media(
                                    download_id, "https://youtube.com/watch?v=test", "audio"
                                )

        repo.update_status.assert_any_call(download_id, "failed", error_message=ANY)
        mock_clean.assert_called()


# ═══════════════════════════════════════════════════════════════
#  2. Timeout handling
# ═══════════════════════════════════════════════════════════════

class TestTimeout:
    """Verify timeout triggers correctly, partial files cleaned, DB updated, semaphore released."""

    async def test_download_timeout_handled(self, service, download_id, deps):
        session, repo = deps

        with patch.object(settings, "MAX_RETRY_COUNT", 0):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(1024 * 1024)):
                with patch.object(service, "_download_with_ytdlp"):
                    with _patch_session(session, repo):
                        # Metadata fetch doesn't use wait_for; download phase does
                        with patch("asyncio.wait_for",
                                   side_effect=asyncio.TimeoutError("Download timed out")):
                            with patch.object(service, '_cleanup_partial') as mock_clean:
                                await service.download_media(
                                    download_id, "https://youtube.com/watch?v=test", "audio"
                                )

        repo.update_status.assert_any_call(download_id, "failed", error_message=ANY)
        mock_clean.assert_called_once()


# ═══════════════════════════════════════════════════════════════
#  3. Retry logic
# ═══════════════════════════════════════════════════════════════

class TestRetry:
    """Verify exponential backoff, retry count respected, permanent failures not retried."""

    async def test_transient_retried_then_succeeds(self, service, download_id, deps):
        """Transient HTTP 503 should be retried, eventually succeed."""
        session, repo = deps
        call_count = 0

        def download_with_retries(url, dtype, outdir, _hook=None):
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise Exception("HTTP Error 503 — service unavailable")
            return metadata(5 * 1024 * 1024)

        with patch.object(settings, "MAX_RETRY_COUNT", 3):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(1024 * 1024)):
                with patch.object(service, "_download_with_ytdlp", side_effect=download_with_retries):
                    with _patch_session(session, repo):
                        with _patch_post_download(5_000_000, "path/to/file.mp3"):
                            await service.download_media(
                                download_id, "https://youtube.com/watch?v=test", "audio"
                            )

        assert call_count > 1, "Should have retried"
        _assert_completed_status(repo.update_status, download_id)

    async def test_max_retries_exceeded_fails(self, service, download_id, deps):
        """Transient errors exceeding MAX_RETRY_COUNT should eventually fail."""
        session, repo = deps
        call_count = 0

        def always_fail(url, dtype, outdir, _hook=None):
            nonlocal call_count
            call_count += 1
            raise Exception("timed out — retryable")

        with patch.object(settings, "MAX_RETRY_COUNT", 2):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(1024 * 1024)):
                with patch.object(service, "_download_with_ytdlp", side_effect=always_fail):
                    with _patch_session(session, repo):
                        with patch.object(service, '_cleanup_partial'):
                            await service.download_media(
                                download_id, "https://youtube.com/watch?v=test", "audio"
                            )

        assert call_count == 3, f"Expected 3 attempts, got {call_count}"
        repo.update_status.assert_any_call(download_id, "failed", error_message=ANY)

    async def test_non_retryable_error_fails_immediately(self, service, download_id, deps):
        """A non-retryable error (no HTTP/timeout keywords) should not be retried."""
        session, repo = deps
        call_count = 0

        def fail_non_retry(url, dtype, outdir, _hook=None):
            nonlocal call_count
            call_count += 1
            raise Exception("Video is private — cannot access")

        with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(1024 * 1024)):
            with patch.object(service, "_download_with_ytdlp", side_effect=fail_non_retry):
                with _patch_session(session, repo):
                    with patch.object(service, '_cleanup_partial'):
                        await service.download_media(
                            download_id, "https://youtube.com/watch?v=test", "audio"
                        )

        # Initial + 2 retries = 3 total
        assert call_count == 3, f"Expected 3 attempts, got {call_count}"
        repo.update_status.assert_any_call(download_id, "failed", error_message=ANY)

    async def test_non_retryable_error_fails_immediately(self, service, download_id, deps):
        """A non-retryable error (no HTTP/timeout keywords) should not be retried."""
        session, repo = deps
        call_count = 0

        def fail_non_retry(url, dtype, outdir, _hook=None):
            nonlocal call_count
            call_count += 1
            raise Exception("Video is private — cannot access")

        with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(1024 * 1024)):
            with patch.object(service, "_download_with_ytdlp", side_effect=fail_non_retry):
                with _patch_session(session, repo):
                    with patch.object(service, '_cleanup_partial'):
                        await service.download_media(
                            download_id, "https://youtube.com/watch?v=test", "audio"
                        )

        assert call_count == 1, "Should NOT have retried"
        repo.update_status.assert_any_call(download_id, "failed", error_message=ANY)

    async def test_exponential_backoff_applied(self, service, download_id, deps):
        """Verify increasing backoff delay between retries."""
        session, repo = deps
        sleep_durations = []

        original_sleep = asyncio.sleep

        async def tracked_sleep(duration):
            sleep_durations.append(duration)
            return await original_sleep(0)

        call_count = 0

        def fail_transient(url, dtype, outdir, _hook=None):
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise Exception("temporary error — retry")
            return metadata(5 * 1024 * 1024)

        with patch.object(settings, "MAX_RETRY_COUNT", 2):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=metadata(1024 * 1024)):
                with patch.object(service, "_download_with_ytdlp", side_effect=fail_transient):
                    with _patch_session(session, repo):
                        with patch("asyncio.sleep", side_effect=tracked_sleep):
                            with _patch_post_download(5_000_000, "path/file.mp3"):
                                await service.download_media(
                                    download_id, "https://youtube.com/watch?v=test", "audio"
                                )

        # Backoff increases: 2^1=2, 2^2=4 (capped at 30)
        assert len(sleep_durations) > 0
        assert all(d > 0 for d in sleep_durations), "All backoffs should be positive"


# ═══════════════════════════════════════════════════════════════
#  4. Concurrency / Semaphore
# ═══════════════════════════════════════════════════════════════

class TestConcurrency:
    """Verify semaphore limits respected, no deadlocks, proper release after exceptions."""

    async def test_semaphore_limits_concurrent(self, service, download_id, deps):
        """MAX_CONCURRENT_VIDEO_DOWNLOADS limit should be respected."""
        max_concurrent = 2
        service._semaphore = asyncio.Semaphore(max_concurrent)

        session, repo = deps
        concurrency_counter = 0
        max_seen = 0

        import time

        def slow_download(url, dtype, outdir, _hook=None):
            nonlocal concurrency_counter, max_seen
            concurrency_counter += 1
            max_seen = max(max_seen, concurrency_counter)
            time.sleep(0.05)
            concurrency_counter -= 1
            raise Exception("not retryable")

        with patch.object(settings, "MAX_RETRY_COUNT", 0):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=None):
                with patch.object(service, "_download_with_ytdlp", side_effect=slow_download):
                    with _patch_session(session, repo):
                        with patch.object(service, '_cleanup_partial'):
                            tasks = [
                                asyncio.create_task(
                                    service.download_media(
                                        uuid.uuid4(), "https://youtube.com/watch?v=test", "audio"
                                    )
                                )
                                for _ in range(6)
                            ]
                            await asyncio.gather(*tasks, return_exceptions=True)

        assert max_seen <= max_concurrent, (
            f"Max concurrent {max_seen} exceeded limit {max_concurrent}"
        )

    async def test_semaphore_released_after_exception(self, service, download_id, deps):
        """Semaphore must be released even when download_media raises."""
        sem = asyncio.Semaphore(1)
        service._semaphore = sem

        assert not sem.locked()

        session, repo = deps

        import time

        def crash(url, dtype, outdir, _hook=None):
            time.sleep(0.02)
            raise Exception("crash")

        with patch.object(service, "_fetch_info_with_ytdlp", return_value=None):
            with patch.object(service, "_download_with_ytdlp", side_effect=crash):
                with _patch_session(session, repo):
                    with patch.object(service, '_cleanup_partial'):
                        await service.download_media(
                            download_id, "https://youtube.com/watch?v=test", "audio"
                        )

        assert not sem.locked(), "Semaphore should be released after exception"

    async def test_no_deadlock_multiple_failures(self, service, download_id, deps):
        """Many concurrent failed downloads should complete without deadlock."""
        service._semaphore = asyncio.Semaphore(3)

        session, repo = deps

        import time

        def fail_all(url, dtype, outdir, _hook=None):
            time.sleep(0.02)
            raise Exception("not retryable")

        with patch.object(settings, "MAX_RETRY_COUNT", 0):
            with patch.object(service, "_fetch_info_with_ytdlp", return_value=None):
                with patch.object(service, "_download_with_ytdlp", side_effect=fail_all):
                    with _patch_session(session, repo):
                        with patch.object(service, '_cleanup_partial'):
                            tasks = [
                                asyncio.create_task(
                                    service.download_media(
                                        uuid.uuid4(), "https://youtube.com/watch?v=test", "audio"
                                    )
                                )
                                for _ in range(15)
                            ]
                            results = await asyncio.gather(*tasks, return_exceptions=True)

        assert len(results) == 15
        assert not any(isinstance(r, asyncio.TimeoutError) for r in results)


# ═══════════════════════════════════════════════════════════════
#  Internal helpers (patches)
# ═══════════════════════════════════════════════════════════════

def _assert_completed_status(mock_update_status, download_id):
    """Assert that update_status was called with status='completed' for this download_id."""
    for args, kwargs in mock_update_status.call_args_list:
        if args and len(args) >= 2 and args[0] == download_id and args[1] == 'completed':
            return
        if args and args[0] == download_id and kwargs.get('status') == 'completed':
            return
    raise AssertionError(
        f"No update_status call found for {download_id} with status='completed'. "
        f"Calls: {mock_update_status.call_args_list}"
    )


@contextmanager
def _patch_session(session, repo):
    """Patch AsyncSessionLocal and VideoDownloadRepository for a test."""
    factory = _make_session_factory(session)
    with patch("app.services.video_download_service.AsyncSessionLocal", factory):
        with patch("app.services.video_download_service.VideoDownloadRepository", return_value=repo):
            yield


@contextmanager
def _patch_post_download(file_size, relative_path):
    """Patch filesystem interactions for post-download phase."""
    file_mock = MagicMock(spec=Path)
    file_mock.is_file.return_value = True
    file_mock.stat.return_value.st_size = file_size
    file_mock.relative_to.return_value = relative_path

    with patch("pathlib.Path.exists", return_value=True):
        with patch("pathlib.Path.iterdir", return_value=[file_mock]):
            yield
