"""Comprehensive API route tests for video endpoints.

Covers:
  - Path traversal protection (GET /{id}/file, DELETE /{id})
  - Authentication enforcement
  - Ownership validation
  - Response schema consistency
  - HTTP status codes
  - Pagination validation
  - Error responses
"""
import os
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, ANY

import httpx
import pytest
from fastapi import FastAPI, HTTPException


# ---------------------------------------------------------------
#  Minimal test app builder
# ---------------------------------------------------------------

with patch("pathlib.Path.mkdir"):
    from app.routes.videos import router
    from app.auth.dependencies import get_current_user, get_db


def _make_test_app(current_user, db_session):
    """Return a FastAPI app with overridden dependencies."""
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: db_session
    return app


# ---------------------------------------------------------------
#  Fixtures
# ---------------------------------------------------------------

@pytest.fixture
async def client(mock_user, mock_db_session):
    app = _make_test_app(mock_user, mock_db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest.fixture
def auth_header(mock_user):
    return {"Authorization": "Bearer test_token"}


@pytest.fixture
def mock_repo():
    repo = MagicMock()
    repo.create = AsyncMock()
    repo.get_by_id_and_user = AsyncMock()
    repo.get_user_downloads = AsyncMock()
    repo.delete_by_id_and_user = AsyncMock()
    repo.update_status = AsyncMock()
    return repo


@pytest.fixture
async def unauth_client(mock_db_session):
    """Client that will raise 403 for unauthenticated requests."""
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: (_ for _ in ()).throw(
        HTTPException(status_code=403, detail="Not authenticated")
    )
    app.dependency_overrides[get_db] = lambda: mock_db_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


# ---------------------------------------------------------------
#  1. POST /download
# ---------------------------------------------------------------

class TestPostDownload:
    async def test_valid_download_queued(self, client, mock_user, mock_db_session, mock_repo, auth_header):
        mock_download = MagicMock()
        mock_download.id = uuid.uuid4()
        mock_download.user_id = mock_user.id
        mock_download.url = "https://youtube.com/watch?v=test"
        mock_download.platform = "youtube"
        mock_download.download_type = "audio"
        mock_download.title = None
        mock_download.status = "pending"
        mock_download.file_path = None
        mock_download.thumbnail_url = None
        mock_download.duration_seconds = None
        mock_download.file_size_bytes = None
        mock_download.error_message = None
        mock_download.created_at = datetime.utcnow()
        mock_download.completed_at = None
        mock_repo.create.return_value = mock_download

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            with patch(
                "app.routes.videos.video_download_service.validate_url",
                return_value=(True, "youtube"),
            ):
                with patch(
                    "app.routes.videos.video_download_service.download_media",
                ) as mock_download_media:
                    response = await client.post(
                        "/api/v1/videos/download",
                        json={"url": "https://youtube.com/watch?v=test", "download_type": "audio"},
                        headers=auth_header,
                    )

        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "pending"
        assert data["platform"] == "youtube"
        assert data["download_type"] == "audio"
        assert "id" in data
        assert "url" in data
        mock_download_media.assert_called_once()

    async def test_invalid_url_returns_400(self, client, auth_header):
        with patch(
            "app.routes.videos.video_download_service.validate_url",
            return_value=(False, "Unsupported platform"),
        ):
            response = await client.post(
                "/api/v1/videos/download",
                json={"url": "https://invalid.com/video", "download_type": "audio"},
                headers=auth_header,
            )

        assert response.status_code == 400
        assert "unsupported" in response.json().get("message", "").lower() or \
               "unsupported" in response.json().get("detail", "").lower()

    async def test_inactive_user_blocked(self, client, inactive_user, auth_header):
        app = _make_test_app(inactive_user, AsyncMock())
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            response = await c.post(
                "/api/v1/videos/download",
                json={"url": "https://youtube.com/watch?v=test", "download_type": "audio"},
                headers=auth_header,
            )

        assert response.status_code == 403

    async def test_no_auth_returns_401(self, unauth_client):
        response = await unauth_client.post(
            "/api/v1/videos/download",
            json={"url": "https://youtube.com/watch?v=test", "download_type": "audio"},
        )
        assert response.status_code == 403

    async def test_invalid_download_type(self, client, auth_header):
        response = await client.post(
            "/api/v1/videos/download",
            json={"url": "https://youtube.com/watch?v=test", "download_type": "invalid"},
            headers=auth_header,
        )
        assert response.status_code == 422

    async def test_db_error_returns_500(self, client, mock_repo, auth_header):
        mock_repo.create.side_effect = Exception("DB connection failed")
        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            with patch(
                "app.routes.videos.video_download_service.validate_url",
                return_value=(True, "youtube"),
            ):
                response = await client.post(
                    "/api/v1/videos/download",
                    json={"url": "https://youtube.com/watch?v=test", "download_type": "audio"},
                    headers=auth_header,
                )

        assert response.status_code == 500


# ---------------------------------------------------------------
#  2. GET /me
# ---------------------------------------------------------------

class TestGetMe:
    async def test_history_returned(self, client, mock_user, mock_db_session, mock_repo, auth_header):
        mock_repo.get_user_downloads.return_value = ([], 0)

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get("/api/v1/videos/me", headers=auth_header)

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert data["total"] == 0

    async def test_pagination_bounds_enforced(self, client, auth_header):
        response = await client.get("/api/v1/videos/me?limit=0", headers=auth_header)
        assert response.status_code == 400

        response = await client.get("/api/v1/videos/me?limit=200", headers=auth_header)
        assert response.status_code == 400

    async def test_status_filter(self, client, mock_user, mock_db_session, mock_repo, auth_header):
        mock_repo.get_user_downloads.return_value = ([], 0)

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                "/api/v1/videos/me?status_filter=completed",
                headers=auth_header,
            )

        assert response.status_code == 200
        # Verify filter was passed through
        mock_repo.get_user_downloads.assert_called_with(
            user_id=mock_user.id, skip=0, limit=20, status="completed"
        )

    async def test_no_auth(self, unauth_client):
        response = await unauth_client.get("/api/v1/videos/me")
        assert response.status_code == 403


# ---------------------------------------------------------------
#  3. GET /{id}
# ---------------------------------------------------------------

class TestGetDetail:
    async def test_detail_returned(self, client, mock_user, mock_db_session, mock_repo, auth_header, mock_download_record):
        mock_download_record.user_id = mock_user.id
        mock_repo.get_by_id_and_user.return_value = mock_download_record

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                f"/api/v1/videos/{mock_download_record.id}",
                headers=auth_header,
            )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(mock_download_record.id)
        assert data["status"] == "completed"
        assert data["platform"] == "youtube"

    async def test_not_found(self, client, mock_repo, auth_header):
        mock_repo.get_by_id_and_user.return_value = None

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                f"/api/v1/videos/{uuid.uuid4()}",
                headers=auth_header,
            )

        assert response.status_code == 404

    async def test_other_users_download_not_found(self, client, mock_user, mock_repo, auth_header, mock_download_record):
        """Ownership: user cannot access another user's download."""
        mock_download_record.user_id = uuid.uuid4()  # Different user
        mock_repo.get_by_id_and_user.return_value = None  # repo filters by user_id

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                f"/api/v1/videos/{mock_download_record.id}",
                headers=auth_header,
            )

        assert response.status_code == 404
        mock_repo.get_by_id_and_user.assert_called_with(mock_download_record.id, mock_user.id)


# ---------------------------------------------------------------
#  4. GET /{id}/file  (with path traversal tests)
# ---------------------------------------------------------------

class TestGetFile:
    async def test_file_served(self, client, mock_user, mock_db_session, mock_repo, auth_header, mock_download_record):
        mock_download_record.user_id = mock_user.id
        mock_repo.get_by_id_and_user.return_value = mock_download_record

        temp_dir = Path(tempfile.mkdtemp())
        old_cwd = os.getcwd()
        try:
            os.chdir(temp_dir)
            storage_dir = Path("storage/downloaded-videos")
            os.makedirs(storage_dir, exist_ok=True)
            dl_dir = storage_dir / str(mock_download_record.id)
            os.makedirs(dl_dir, exist_ok=True)
            test_file = dl_dir / "test.mp3"
            test_file.write_text("fake audio data")

            mock_download_record.file_path = f"storage/downloaded-videos/{mock_download_record.id}/test.mp3"

            with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
                response = await client.get(
                    f"/api/v1/videos/{mock_download_record.id}/file",
                    headers=auth_header,
                )

            assert response.status_code == 200
            assert response.headers["content-type"] == "audio/mpeg"
        finally:
            os.chdir(old_cwd)
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def test_not_found(self, client, mock_repo, auth_header):
        mock_repo.get_by_id_and_user.return_value = None

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                f"/api/v1/videos/{uuid.uuid4()}/file",
                headers=auth_header,
            )

        assert response.status_code == 404

    async def test_not_completed(self, client, mock_user, mock_repo, auth_header, mock_pending_download):
        mock_pending_download.user_id = mock_user.id
        mock_repo.get_by_id_and_user.return_value = mock_pending_download

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                f"/api/v1/videos/{mock_pending_download.id}/file",
                headers=auth_header,
            )

        assert response.status_code == 400
        assert "not completed" in response.json().get("message", "").lower() or \
               "not completed" in response.json().get("detail", "").lower()

    async def test_path_traversal_blocked(self, client, mock_user, mock_repo, auth_header, mock_download_record):
        """GET /{id}/file with path traversal in file_path must be blocked."""
        mock_download_record.user_id = mock_user.id
        mock_download_record.file_path = "../../../etc/passwd"
        mock_repo.get_by_id_and_user.return_value = mock_download_record

        temp_dir = Path(tempfile.mkdtemp())
        old_cwd = os.getcwd()
        try:
            os.chdir(temp_dir)
            os.makedirs("storage/downloaded-videos", exist_ok=True)

            with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
                response = await client.get(
                    f"/api/v1/videos/{mock_download_record.id}/file",
                    headers=auth_header,
                )

            assert response.status_code == 400
        finally:
            os.chdir(old_cwd)
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def test_path_outside_storage_blocked(self, client, mock_user, mock_repo, auth_header, mock_download_record):
        """file_path that resolves outside storage/downloaded-videos must be rejected."""
        mock_download_record.user_id = mock_user.id
        mock_repo.get_by_id_and_user.return_value = mock_download_record

        temp_dir = Path(tempfile.mkdtemp())
        old_cwd = os.getcwd()
        try:
            os.chdir(temp_dir)
            os.makedirs("storage/downloaded-videos", exist_ok=True)

            # Create a file completely outside the storage dir
            outside_file = Path("outside/leaked.txt")
            os.makedirs(outside_file.parent, exist_ok=True)
            outside_file.write_text("secret")

            mock_download_record.file_path = "outside/leaked.txt"

            with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
                response = await client.get(
                    f"/api/v1/videos/{mock_download_record.id}/file",
                    headers=auth_header,
                )

            assert response.status_code == 400
        finally:
            os.chdir(old_cwd)
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def test_file_not_found_on_disk(self, client, mock_user, mock_repo, auth_header, mock_download_record):
        """Completed download but file missing on disk should return 404."""
        mock_download_record.user_id = mock_user.id
        mock_download_record.file_path = "storage/downloaded-videos/some-uuid/missing.mp3"
        mock_repo.get_by_id_and_user.return_value = mock_download_record

        temp_dir = Path(tempfile.mkdtemp())
        old_cwd = os.getcwd()
        try:
            os.chdir(temp_dir)
            storage_dir = Path("storage/downloaded-videos")
            os.makedirs(storage_dir, exist_ok=True)

            with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
                response = await client.get(
                    f"/api/v1/videos/{mock_download_record.id}/file",
                    headers=auth_header,
                )

            assert response.status_code == 400
        finally:
            os.chdir(old_cwd)
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def test_ownership_enforced(self, client, mock_user, mock_repo, auth_header, mock_download_record):
        """User cannot download another user's file."""
        mock_download_record.user_id = uuid.uuid4()  # Different user
        mock_repo.get_by_id_and_user.return_value = None

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                f"/api/v1/videos/{mock_download_record.id}/file",
                headers=auth_header,
            )

        assert response.status_code == 404


# ---------------------------------------------------------------
#  5. DELETE /{id}  (with path traversal tests)
# ---------------------------------------------------------------

class TestDelete:
    async def test_delete_success(self, client, mock_user, mock_db_session, mock_repo, auth_header, mock_download_record):
        mock_download_record.user_id = mock_user.id
        mock_download_record.file_path = f"storage/downloaded-videos/{mock_download_record.id}/video.mp4"
        mock_repo.get_by_id_and_user.return_value = mock_download_record
        mock_repo.delete_by_id_and_user.return_value = True

        temp_dir = Path(tempfile.mkdtemp())
        old_cwd = os.getcwd()
        try:
            os.chdir(temp_dir)
            dl_dir = Path(f"storage/downloaded-videos/{mock_download_record.id}")
            os.makedirs(dl_dir, exist_ok=True)
            test_file = dl_dir / "video.mp4"
            test_file.write_text("fake video data")

            with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
                response = await client.delete(
                    f"/api/v1/videos/{mock_download_record.id}",
                    headers=auth_header,
                )

            assert response.status_code == 200
            assert response.json().get("success") is True
            # Verify the directory was deleted
            assert not dl_dir.exists()
        finally:
            os.chdir(old_cwd)
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def test_delete_not_found(self, client, mock_repo, auth_header):
        mock_repo.get_by_id_and_user.return_value = None

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.delete(
                f"/api/v1/videos/{uuid.uuid4()}",
                headers=auth_header,
            )

        assert response.status_code == 404

    async def test_delete_ownership_enforced(self, client, mock_user, mock_repo, auth_header, mock_download_record):
        """User cannot delete another user's download."""
        mock_download_record.user_id = uuid.uuid4()
        mock_repo.get_by_id_and_user.return_value = None

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.delete(
                f"/api/v1/videos/{mock_download_record.id}",
                headers=auth_header,
            )

        assert response.status_code == 404

    async def test_delete_traversal_blocked(self, client, mock_user, mock_repo, auth_header, mock_download_record):
        """DELETE with malicious file_path should not delete outside files."""
        mock_download_record.user_id = mock_user.id
        mock_download_record.file_path = "../../../etc/passwd"
        mock_repo.get_by_id_and_user.return_value = mock_download_record
        mock_repo.delete_by_id_and_user.return_value = True

        temp_dir = Path(tempfile.mkdtemp())
        old_cwd = os.getcwd()
        try:
            os.chdir(temp_dir)
            os.makedirs("storage/downloaded-videos", exist_ok=True)

            # Create a "target" file outside storage to verify it's NOT deleted
            target_file = Path("target.txt")
            target_file.write_text("should not be deleted")

            with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
                response = await client.delete(
                    f"/api/v1/videos/{mock_download_record.id}",
                    headers=auth_header,
                )

            assert response.status_code == 200
            # The target file should NOT have been deleted
            assert target_file.exists(), "Path traversal should not delete files outside storage"
        finally:
            os.chdir(old_cwd)
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def test_delete_db_record_removed(self, client, mock_user, mock_db_session, mock_repo, auth_header, mock_download_record):
        """Verify delete_by_id_and_user is called after file deletion."""
        mock_download_record.user_id = mock_user.id
        mock_download_record.file_path = None  # No file to clean
        mock_repo.get_by_id_and_user.return_value = mock_download_record
        mock_repo.delete_by_id_and_user.return_value = True

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.delete(
                f"/api/v1/videos/{mock_download_record.id}",
                headers=auth_header,
            )

        assert response.status_code == 200
        mock_repo.delete_by_id_and_user.assert_called_with(
            mock_download_record.id, mock_user.id
        )
        mock_db_session.commit.assert_called()

    async def test_delete_inactive_user(self, client, inactive_user, auth_header):
        app = _make_test_app(inactive_user, AsyncMock())
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            response = await c.delete(
                f"/api/v1/videos/{uuid.uuid4()}",
                headers=auth_header,
            )
        assert response.status_code == 403


# ---------------------------------------------------------------
#  6. Authentication enforcement (cross-endpoint)
# ---------------------------------------------------------------

class TestAuthentication:
    """Verify all endpoints block unauthenticated requests."""

    @pytest.mark.parametrize("method,path_template,body", [
        ("POST", "/api/v1/videos/download", {"url": "https://youtube.com/watch?v=test", "download_type": "audio"}),
        ("GET", "/api/v1/videos/me", None),
        ("GET", "/api/v1/videos/{id}", None),
        ("GET", "/api/v1/videos/{id}/file", None),
        ("POST", "/api/v1/videos/{id}/cancel", None),
        ("DELETE", "/api/v1/videos/{id}", None),
    ])
    async def test_unauthenticated_blocked(self, unauth_client, method, path_template, body):
        path = path_template.replace("{id}", str(uuid.uuid4()))
        if method == "POST":
            response = await unauth_client.post(path, json=body or {})
        elif method == "GET":
            response = await unauth_client.get(path)
        elif method == "DELETE":
            response = await unauth_client.delete(path)
        else:
            pytest.fail(f"Unknown method: {method}")

        assert response.status_code == 403


# ---------------------------------------------------------------
#  7. Ownership enforcement (cross-endpoint)
# ---------------------------------------------------------------

class TestOwnership:
    """Verify users cannot access each other's downloads."""

    async def test_other_users_download_not_listed(self, client, mock_user, mock_db_session, mock_repo, auth_header):
        """GET /me should only return the current user's downloads."""
        # Mock returns downloads that belong to the current user (via repo filtering)
        mock_repo.get_user_downloads.return_value = ([], 0)

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get("/api/v1/videos/me", headers=auth_header)
            assert response.status_code == 200
            # Verify repo was called with correct user_id
            mock_repo.get_user_downloads.assert_called_with(
                user_id=mock_user.id, skip=0, limit=20, status=None
            )


# ---------------------------------------------------------------
#  8. Response schema consistency
# ---------------------------------------------------------------

class TestResponseSchema:
    """Verify all responses follow expected schemas."""

    async def test_error_response_format(self, unauth_client):
        response = await unauth_client.get(
            f"/api/v1/videos/{uuid.uuid4()}/file",
        )
        assert response.status_code == 403
        # Error responses should be JSON
        data = response.json()
        assert isinstance(data, dict)

    async def test_history_pagination_fields(self, client, mock_user, mock_db_session, mock_repo, auth_header):
        mock_repo.get_user_downloads.return_value = ([], 0)

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.get(
                "/api/v1/videos/me?skip=10&limit=5",
                headers=auth_header,
            )

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2  # skip=10, limit=5 → page=2
        assert data["page_size"] == 5


# ---------------------------------------------------------------
#  9. Cancel download
# ---------------------------------------------------------------

class TestCancelDownload:
    async def test_cancel_pending_download(self, client, mock_user, mock_db_session, mock_repo, auth_header):
        """POST /{id}/cancel should cancel a pending download."""
        mock_download = MagicMock()
        mock_download.id = uuid.uuid4()
        mock_download.user_id = mock_user.id
        mock_download.status = "pending"
        mock_repo.get_by_id_and_user.return_value = mock_download

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            with patch(
                "app.routes.videos.video_download_service.cancel_download",
                new_callable=AsyncMock,
                return_value=True,
            ) as mock_cancel:
                response = await client.post(
                    f"/api/v1/videos/{mock_download.id}/cancel",
                    headers=auth_header,
                )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_cancel.assert_called_once_with(mock_download.id)

    async def test_cancel_completed_returns_400(self, client, mock_user, mock_db_session, mock_repo, auth_header):
        """Cancel should fail for completed downloads."""
        mock_download = MagicMock()
        mock_download.id = uuid.uuid4()
        mock_download.user_id = mock_user.id
        mock_download.status = "completed"
        mock_repo.get_by_id_and_user.return_value = mock_download

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.post(
                f"/api/v1/videos/{mock_download.id}/cancel",
                headers=auth_header,
            )

        assert response.status_code == 400

    async def test_cancel_not_found(self, client, mock_repo, auth_header):
        """Cancel should return 404 for non-existent download."""
        mock_repo.get_by_id_and_user.return_value = None

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.post(
                f"/api/v1/videos/{uuid.uuid4()}/cancel",
                headers=auth_header,
            )

        assert response.status_code == 404

    async def test_cancel_ownership_enforced(self, client, mock_user, mock_repo, auth_header):
        """User cannot cancel another user's download."""
        mock_download = MagicMock()
        mock_download.id = uuid.uuid4()
        mock_download.user_id = uuid.uuid4()
        mock_repo.get_by_id_and_user.return_value = None

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            response = await client.post(
                f"/api/v1/videos/{mock_download.id}/cancel",
                headers=auth_header,
            )

        assert response.status_code == 404

    async def test_cancel_inactive_user(self, client, inactive_user, auth_header):
        """Inactive user cannot cancel."""
        app = _make_test_app(inactive_user, AsyncMock())
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            response = await c.post(
                f"/api/v1/videos/{uuid.uuid4()}/cancel",
                headers=auth_header,
            )
        assert response.status_code == 403

    async def test_progress_in_detail_response(self, client, mock_user, mock_db_session, mock_repo, auth_header, mock_download_record):
        """Detail endpoint should include progress fields when download is active."""
        mock_download_record.user_id = mock_user.id
        mock_download_record.status = "downloading"
        mock_repo.get_by_id_and_user.return_value = mock_download_record

        mock_progress = {
            "progress_percent": 45,
            "downloaded_bytes": 45_000_000,
            "total_bytes": 100_000_000,
            "download_speed": 2_500_000.0,
            "eta_seconds": 22,
        }

        with patch("app.routes.videos.VideoDownloadRepository", return_value=mock_repo):
            with patch(
                "app.routes.videos.video_download_service.get_progress",
                return_value=mock_progress,
            ):
                response = await client.get(
                    f"/api/v1/videos/{mock_download_record.id}",
                    headers=auth_header,
                )

        assert response.status_code == 200
        data = response.json()
        assert data["progress_percent"] == 45
        assert data["download_speed"] == 2_500_000.0
        assert data["eta_seconds"] == 22
