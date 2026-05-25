"""Tests for video service features: cancel, progress, and URL validation."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.video_download_service import VideoDownloadService, DownloadCancelledError

service = VideoDownloadService()


class TestCancelFlag:
    def test_cancel_flag_set_and_clear(self):
        download_id = uuid.uuid4()

        assert service._cancel_flags.get(download_id) is None

        service._set_cancel_flag(download_id)
        assert download_id in service._cancel_flags
        assert service._cancel_flags[download_id].is_set()

        service._clear_cancel_flag(download_id)
        assert service._cancel_flags.get(download_id) is None

    def test_check_cancelled_raises(self):
        download_id = uuid.uuid4()

        service._set_cancel_flag(download_id)
        with pytest.raises(DownloadCancelledError):
            service._check_cancelled(download_id)

        service._clear_cancel_flag(download_id)

    def test_check_cancelled_no_flag(self):
        download_id = uuid.uuid4()
        service._check_cancelled(download_id)


class TestProgressCache:
    def test_progress_cache_set_and_get(self):
        download_id = uuid.uuid4()

        assert service.get_progress(download_id) is None

        progress = {"progress_percent": 50, "downloaded_bytes": 1000, "total_bytes": 2000}
        with service._lock:
            service._progress_cache[download_id] = progress

        cached = service.get_progress(download_id)
        assert cached == progress

        service.clear_progress(download_id)
        assert service.get_progress(download_id) is None

    def test_clear_progress_non_existent(self):
        service.clear_progress(uuid.uuid4())

    def test_make_progress_hook_updates_cache(self):
        download_id = uuid.uuid4()
        hook = service._make_progress_hook(download_id)

        hook({"status": "downloading", "_percent_str": " 45.5%", "downloaded_bytes": 45000000, "total_bytes": 100000000, "speed": 2500000.0, "eta": 22})

        cached = service.get_progress(download_id)
        assert cached is not None
        assert cached["progress_percent"] == 45
        assert cached["downloaded_bytes"] == 45000000
        assert cached["total_bytes"] == 100000000
        assert cached["download_speed"] == 2500000.0
        assert cached["eta_seconds"] == 22

        service.clear_progress(download_id)

    def test_make_progress_hook_finished_sets_100_percent(self):
        download_id = uuid.uuid4()
        hook = service._make_progress_hook(download_id)

        hook({"status": "downloading", "_percent_str": "50%", "downloaded_bytes": 500, "total_bytes": 1000, "speed": 100.0, "eta": 5})
        assert service.get_progress(download_id) is not None
        assert service.get_progress(download_id)["progress_percent"] == 50

        hook({"status": "finished"})
        cached = service.get_progress(download_id)
        assert cached is not None
        assert cached["progress_percent"] == 100

    def test_make_progress_hook_cancelled_raises(self):
        download_id = uuid.uuid4()
        service._set_cancel_flag(download_id)

        hook = service._make_progress_hook(download_id)
        with pytest.raises(DownloadCancelledError):
            hook({"status": "downloading", "_percent_str": "10%", "downloaded_bytes": 100, "total_bytes": 1000, "speed": 100.0, "eta": 10})

        service._clear_cancel_flag(download_id)


class TestCancelDownload:
    @pytest.mark.asyncio
    async def test_cancel_download_sets_flag_and_updates_db(self):
        download_id = uuid.uuid4()

        mock_session = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        mock_repo = MagicMock()
        mock_download = MagicMock()
        mock_download.status = "downloading"
        mock_repo.get_by_id = AsyncMock(return_value=mock_download)
        mock_repo.update_status = AsyncMock()

        session_cm = AsyncMock()
        session_cm.__aenter__ = AsyncMock(return_value=mock_session)
        session_cm.__aexit__ = AsyncMock(return_value=None)

        with patch("app.services.video_download_service.AsyncSessionLocal", return_value=session_cm):
            with patch("app.services.video_download_service.VideoDownloadRepository", return_value=mock_repo):
                with patch.object(service, '_cleanup_partial') as mock_clean:
                    result = await service.cancel_download(download_id)

        assert result is True
        assert service._cancel_flags.get(download_id) is None
        assert service.get_progress(download_id) is None
        mock_clean.assert_called_once()


class TestURLValidation:
    @pytest.mark.parametrize("url", [
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://instagram.com/reel/ABC123xyz/",
        "https://www.instagram.com/p/ABC123/",
    ])
    def test_valid_urls(self, url):
        is_valid, platform = service.validate_url(url)
        assert is_valid
        assert platform in ("youtube", "instagram")

    @pytest.mark.parametrize("url", [
        "",
        "   ",
        "https://facebook.com/watch?v=test",
        "http://localhost:8080/video",
        "http://127.0.0.1/video",
        "file:///etc/passwd",
        "https://instagram.com/username/",
    ])
    def test_invalid_urls(self, url):
        is_valid, _ = service.validate_url(url)
        assert not is_valid


class TestProgressHookCancelledIntegration:
    def test_progress_hook_checks_cancel_flag(self):
        download_id = uuid.uuid4()
        service._set_cancel_flag(download_id)

        hook = service._make_progress_hook(download_id)
        progress_data = {
            "status": "downloading",
            "_percent_str": "50%",
            "downloaded_bytes": 500,
            "total_bytes": 1000,
            "speed": 100.0,
            "eta": 5,
        }

        with pytest.raises(DownloadCancelledError):
            hook(progress_data)

        service._clear_cancel_flag(download_id)
