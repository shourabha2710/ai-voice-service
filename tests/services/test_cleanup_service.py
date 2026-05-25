"""Tests for CleanupService.

Covers:
  - Active downloads NOT deleted
  - Orphaned folders cleaned
  - Completed expired downloads deleted
  - Filesystem / DB consistency maintained
"""
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock, call

import pytest

from app.config.settings import settings
from app.services.cleanup_service import CleanupService


@pytest.fixture
def cleanup():
    return CleanupService()


@pytest.fixture
def mock_session():
    session = AsyncMock(name="db_session")
    session.commit = AsyncMock(name="commit")
    session.execute = AsyncMock(name="execute")
    return session


class TestCleanupActiveDownloads:
    """Active/in-progress downloads must NOT be deleted."""

    async def test_in_progress_skipped(self, cleanup, mock_session):
        """Downloads with status 'downloading' should not be deleted."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)  # Old enough to be eligible

        with _patch_cleanup_deps(
            mock_session, download_dir, status="downloading",
        ):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_not_called()

    async def test_pending_skipped(self, cleanup, mock_session):
        """Pending downloads should not be deleted."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        with _patch_cleanup_deps(
            mock_session, download_dir, status="pending",
        ):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_not_called()

    async def test_processing_skipped(self, cleanup, mock_session):
        """Processing downloads should not be deleted."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        with _patch_cleanup_deps(
            mock_session, download_dir, status="processing",
        ):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_not_called()


class TestCleanupOrphanedFolders:
    """Orphaned directories (no DB record or non-UUID) must be cleaned."""

    async def test_non_uuid_directory_deleted(self, cleanup, mock_session):
        """Directories with non-UUID names should be treated as orphaned."""
        download_dir = _fake_dir("some-random-folder", age_hours=48)

        with _patch_cleanup_deps(mock_session, download_dir, no_db_record=True):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_called_once_with(download_dir)

    async def test_orphaned_uuid_directory_deleted(self, cleanup, mock_session):
        """UUID-named directory with no DB record should be deleted."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        with _patch_cleanup_deps(mock_session, download_dir, no_db_record=True):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_called_once_with(download_dir)

    async def test_orphaned_directory_recent_not_deleted(self, cleanup, mock_session):
        """Recent directories (under cutoff) should NOT be deleted even if orphaned."""
        dir_uuid = uuid.uuid4()
        # Directory is only 30 seconds old — within expiration window (60s)
        download_dir = _fake_dir(dir_uuid, age_hours=0.0083)

        with _patch_cleanup_deps(mock_session, download_dir, no_db_record=True):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_not_called()


class TestCleanupExpiredCompleted:
    """Completed/failed downloads past expiration must be deleted."""

    async def test_completed_expired_deleted(self, cleanup, mock_session):
        """Completed download older than cutoff should be deleted."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        with _patch_cleanup_deps(
            mock_session,
            download_dir,
            status="completed",
            eligible=True,
        ):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_called_once_with(download_dir)

    async def test_failed_expired_deleted(self, cleanup, mock_session):
        """Failed download older than cutoff should be deleted."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        with _patch_cleanup_deps(
            mock_session,
            download_dir,
            status="failed",
            eligible=True,
        ):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_called_once_with(download_dir)

    async def test_completed_not_expired_kept(self, cleanup, mock_session):
        """Completed download within expiration window should be kept."""
        dir_uuid = uuid.uuid4()
        # Directory is recent — within expiration
        download_dir = _fake_dir(dir_uuid, age_hours=0.5)

        with _patch_cleanup_deps(
            mock_session,
            download_dir,
            status="completed",
            eligible=False,
        ):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_not_called()


class TestCleanupDBRecordDeletion:
    """Verify DB records are deleted for eligible downloads."""

    async def test_db_records_deleted_for_eligible(self, cleanup, mock_session):
        """DB records should be deleted for completed/failed expired downloads."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        mock_repo = MagicMock(name="VideoDownloadRepository")
        mock_repo.delete_old_downloads = AsyncMock(return_value=5)

        with _patch_cleanup_deps(
            mock_session,
            download_dir,
            status="completed",
            eligible=True,
            repo=mock_repo,
        ):
            with patch("shutil.rmtree"):
                await cleanup.cleanup_old_video_downloads()

        mock_repo.delete_old_downloads.assert_called_once()
        mock_session.commit.assert_called()


class TestCleanupFilesystemConsistency:
    """Filesystem and DB should remain consistent after cleanup."""

    async def test_directory_deleted_then_record_deleted(self, cleanup, mock_session):
        """Filesystem deletion should happen before DB record deletion."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        mock_repo = MagicMock(name="VideoDownloadRepository")
        mock_repo.delete_old_downloads = AsyncMock(return_value=1)

        deletion_order = []

        def tracked_rmtree(path):
            deletion_order.append(("fs", path))

        async def tracked_delete(cutoff):
            deletion_order.append(("db", cutoff))
            return 1

        mock_repo.delete_old_downloads = tracked_delete

        with _patch_cleanup_deps(
            mock_session,
            download_dir,
            status="completed",
            eligible=True,
            repo=mock_repo,
        ):
            with patch("shutil.rmtree", side_effect=tracked_rmtree):
                await cleanup.cleanup_old_video_downloads()

        assert len(deletion_order) >= 2
        # Filesystem deletion should occur before DB deletion
        assert deletion_order[0][0] == "fs"
        # DB deletion should happen
        assert any(op[0] == "db" for op in deletion_order)

    async def test_skip_dirs_within_expiration(self, cleanup, mock_session):
        """Directories newer than the cutoff should never be touched."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=0.1)  # Very recent

        with _patch_cleanup_deps(
            mock_session,
            download_dir,
            status="completed",
            eligible=False,
        ):
            with patch("shutil.rmtree") as mock_rmtree:
                await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_not_called()

    async def test_filesystem_error_handling(self, cleanup, mock_session):
        """Filesystem errors should not crash the cleanup loop."""
        dir_uuid = uuid.uuid4()
        download_dir = _fake_dir(dir_uuid, age_hours=48)

        with _patch_cleanup_deps(mock_session, download_dir, no_db_record=True):
            with patch("shutil.rmtree", side_effect=PermissionError("Access denied")):
                # Should not raise
                await cleanup.cleanup_old_video_downloads()

    async def test_non_directory_skipped(self, cleanup, mock_session):
        """Non-directory entries (files) in the video storage should be skipped."""
        file_entry = MagicMock(spec=Path)
        file_entry.is_dir.return_value = False
        file_entry.is_file.return_value = True
        file_entry.name = "some_file.tmp"

        with patch("app.services.cleanup_service.Path") as mock_path_cls:
            instance = MagicMock()
            instance.exists.return_value = True
            instance.iterdir.return_value = [file_entry]
            mock_path_cls.return_value = instance

            mock_repo = MagicMock()
            mock_repo.delete_old_downloads = AsyncMock(return_value=0)

            session_cm = AsyncMock()
            session_cm.__aenter__.return_value = mock_session
            session_cm.__aexit__.return_value = None

            with patch("app.db.session.AsyncSessionLocal", return_value=session_cm):
                with patch("app.db.repositories.video.VideoDownloadRepository", return_value=mock_repo):
                    with patch("app.services.cleanup_service.select"):
                        with patch("shutil.rmtree") as mock_rmtree:
                            await cleanup.cleanup_old_video_downloads()

        mock_rmtree.assert_not_called()


# ═══════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════

def _fake_dir(name, *, age_hours=48):
    """Create a MagicMock Path representing a download directory."""
    d = MagicMock(spec=Path)
    d.is_dir.return_value = True
    d.name = str(name)
    d.stat.return_value.st_mtime = (datetime.utcnow() - timedelta(hours=age_hours)).timestamp()
    return d


def _mock_download(status="completed", eligible=False):
    """Create a mock VideoDownload model instance."""
    dl = MagicMock(name="VideoDownload")
    dl.id = uuid.uuid4()
    dl.user_id = uuid.uuid4()
    dl.status = status
    dl.created_at = datetime.utcnow() - timedelta(hours=48)
    dl.completed_at = datetime.utcnow() - timedelta(hours=47) if status in ("completed", "failed") else None
    return dl


@contextmanager
def _patch_cleanup_deps(
    session,
    download_dir,
    *,
    status="completed",
    eligible=False,
    no_db_record=False,
    repo=None,
):
    """Patch all externals for CleanupService.cleanup_old_video_downloads()."""
    # Patch settings
    with patch.object(settings, "JOB_EXPIRATION_MINUTES", 1):
        # Patch Path for storage lookup
        with patch("app.services.cleanup_service.Path") as mock_path_cls:
            storage_instance = MagicMock(spec=Path)
            storage_instance.exists.return_value = True
            if download_dir:
                storage_instance.iterdir.return_value = [download_dir]
            else:
                storage_instance.iterdir.return_value = []
            mock_path_cls.return_value = storage_instance

            # Patch session factory at the source module
            session_cm = AsyncMock(name="session_cm")
            session_cm.__aenter__.return_value = session
            session_cm.__aexit__.return_value = None

            with patch("app.db.session.AsyncSessionLocal", return_value=session_cm):
                # Patch the VideoDownload model's select targets
                scalar_result = MagicMock()
                if eligible:
                    dl_id = uuid.UUID(str(download_dir.name)) if isinstance(download_dir.name, str) and _is_uuid(download_dir.name) else uuid.uuid4()
                    scalar_result.scalars.return_value.all.return_value = [dl_id]
                else:
                    scalar_result.scalars.return_value.all.return_value = []

                session.execute.return_value = scalar_result

                # Patch VideoDownloadRepository at the source
                inner_repo = repo or MagicMock(name="VideoDownloadRepository")
                if isinstance(inner_repo, MagicMock):
                    if no_db_record:
                        inner_repo.get_by_id = AsyncMock(return_value=None)
                    else:
                        inner_repo.get_by_id = AsyncMock(return_value=_mock_download(status))
                    if repo is None:
                        inner_repo.delete_old_downloads = AsyncMock(return_value=0)

                with patch("app.db.repositories.video.VideoDownloadRepository", return_value=inner_repo):
                    yield


def _is_uuid(s):
    try:
        uuid.UUID(s)
        return True
    except (ValueError, AttributeError):
        return False



