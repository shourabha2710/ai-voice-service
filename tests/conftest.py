import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(scope="session", autouse=True)
def _patch_storage_on_import():
    """Prevent filesystem side effects when importing service/routes modules."""
    with patch("pathlib.Path.mkdir"):
        yield


@pytest.fixture(scope="session")
def video_route_deps(_patch_storage_on_import):
    """Import video router and auth dependencies once under the storage patch."""
    from app.routes.videos import router
    from app.auth.dependencies import get_current_user
    from app.db.session import get_db
    return {
        "router": router,
        "get_current_user": get_current_user,
        "get_db": get_db,
    }


@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "test@example.com"
    user.is_active = True
    user.full_name = "Test User"
    return user


@pytest.fixture
def other_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "other@example.com"
    user.is_active = True
    user.full_name = "Other User"
    return user


@pytest.fixture
def inactive_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "inactive@example.com"
    user.is_active = False
    user.full_name = "Inactive User"
    return user


@pytest.fixture
def mock_db_session():
    return AsyncMock()


@pytest.fixture
def mock_download_record():
    record = MagicMock()
    record.id = uuid.uuid4()
    record.user_id = uuid.uuid4()
    record.url = "https://youtube.com/watch?v=dQw4w9WgXcQ"
    record.platform = "youtube"
    record.download_type = "audio"
    record.title = "Test Video"
    record.status = "completed"
    record.file_path = "storage/downloaded-videos/some-uuid/test.mp3"
    record.thumbnail_url = None
    record.duration_seconds = 120
    record.file_size_bytes = 5_000_000
    record.error_message = None
    record.created_at = datetime.utcnow()
    record.completed_at = datetime.utcnow()
    return record


@pytest.fixture
def mock_pending_download():
    record = MagicMock()
    record.id = uuid.uuid4()
    record.user_id = uuid.uuid4()
    record.url = "https://youtube.com/watch?v=dQw4w9WgXcQ"
    record.platform = "youtube"
    record.download_type = "audio"
    record.title = None
    record.status = "pending"
    record.file_path = None
    record.thumbnail_url = None
    record.duration_seconds = None
    record.file_size_bytes = None
    record.error_message = None
    record.created_at = datetime.utcnow()
    record.completed_at = None
    return record
