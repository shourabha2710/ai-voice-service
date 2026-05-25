# Production Audit: YouTube/Instagram Video Downloader Feature

**Date:** 2026-05-25  
**Component:** Video Download Module (app/services/video_download_service.py, app/routes/videos.py, app/db/repositories/video.py, cleanup_service.py)  
**Severity Analysis:** 3 CRITICAL, 5 HIGH, 8 MEDIUM, 4 LOW

---

## CRITICAL ISSUES (Block Production Deployment)

### 🔴 ISSUE #1: SQL Syntax Error in Cleanup Query
**Severity:** CRITICAL  
**File:** `app/db/repositories/video.py`, line ~130  
**Problem:** Uses `!= None` in SQLAlchemy which generates invalid SQL. Should use `.isnot(None)`.

```python
# CURRENT (WRONG):
select(VideoDownload).where(
    (VideoDownload.completed_at != None) &  # ❌ WRONG
    (VideoDownload.created_at < datetime.fromtimestamp(cutoff_timestamp))
)

# RESULT IN SQL: WHERE "completed_at" != NULL  (always FALSE - NULL comparisons fail)
# This means cleanup NEVER deletes anything from DB
```

**Impact:** Database will fill with old download records indefinitely, causing performance degradation.

**Fix:**
```python
select(VideoDownload).where(
    (VideoDownload.completed_at.isnot(None)) &  # ✅ CORRECT
    (VideoDownload.created_at < datetime.fromtimestamp(cutoff_timestamp))
)
```

---

### 🔴 ISSUE #2: SSRF Vulnerability - IPv6 Localhost Bypass
**Severity:** CRITICAL  
**File:** `app/services/video_download_service.py`, line ~45-50  
**Problem:** URL validation doesn't check for IPv6 addresses. Attacker can bypass checks with:

```
http://[::1]/
http://[2001:db8::1]/
http://[fe80::1]/
```

Also misses obfuscated formats:
```
http://127.0.0.1.nip.io  (DNS rebind)
http://0/  (shorthand for 127.0.0.1 on some systems)
http://localhost:8000/  (localhost with port)
```

**Impact:** Potential internal network access, SSRF attacks against internal services.

**Fix:**
```python
def validate_url(self, url: str) -> Tuple[bool, str]:
    """Validate URL is from a supported platform."""
    try:
        if not url.strip():
            return False, "URL cannot be empty"

        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        
        # Remove port if present for checking
        domain_only = domain.split(':')[0] if ':' in domain else domain

        # Reject localhost and private networks (IPv4 and IPv6)
        private_patterns = [
            "localhost",
            "127.",           # 127.0.0.0/8
            "192.168.",       # 192.168.0.0/16
            "10.",            # 10.0.0.0/8
            "172.1",          # 172.16.0.0/12 start
            "169.254.",       # Link-local
            "::1",            # IPv6 loopback
            "fe80:",          # IPv6 link-local
            "fc",             # IPv6 private (fc00::/7)
            "fd",             # IPv6 private (fc00::/7)
            "::ffff:127.",    # IPv4-mapped IPv6 loopback
            "::ffff:192.168", # IPv4-mapped private
            "0.0.0.0",        # All zeros
            "255.255.255.255",# Broadcast
        ]
        
        if any(domain_only.lower().startswith(pattern) for pattern in private_patterns):
            return False, "Private/local URLs not allowed"

        # Reject file URLs and FTP
        if parsed.scheme in ["file", "ftp", "sftp", "gopher", "data", "jar"]:
            return False, f"Scheme '{parsed.scheme}' not allowed"

        # Additional check: domain should be IP-like or have TLD
        # Reject if it looks like an IP that wasn't caught above
        try:
            import ipaddress
            try:
                ip = ipaddress.ip_address(domain_only)
                # Any public IP should still be OK (YouTube/Instagram CDNs)
                if ip.is_private or ip.is_loopback or ip.is_link_local:
                    return False, "Private IP not allowed"
            except ValueError:
                # Not an IP address, continue with domain check
                pass
        except Exception:
            pass

        # Check against supported platforms
        for platform_domain, platform_name in self.SUPPORTED_PLATFORMS.items():
            if platform_domain in domain:
                if platform_name == "instagram":
                    if "/reel/" not in url and "/p/" not in url:
                        return False, "Only Instagram reels and posts are supported"
                return True, platform_name

        return False, "Unsupported platform (only YouTube and Instagram supported)"

    except Exception as e:
        logger.error(f"URL validation error: {e}")
        return False, f"Invalid URL format"
```

---

### 🔴 ISSUE #3: Race Condition - Concurrent Downloads Same Video
**Severity:** CRITICAL  
**File:** `app/services/video_download_service.py`, line ~98-105  
**Problem:** Multiple users downloading the same video creates the same directory and files overwrite:

```
download_id_1 → storage/downloaded-videos/{uuid_1}/ → download_1.mp4
download_id_2 → storage/downloaded-videos/{uuid_2}/ → download_2.mp4

SCENARIO: 2 users, same video, same second → both get same UUID (very rare but possible)
LIKELY SCENARIO: Both attempt to download to same YouTube video file
→ yt-dlp creates "video.mp4" in BOTH directories simultaneously
→ File handle contention, partial writes, corruption
```

Actually, reviewing more: each download gets its own UUID directory, so the scenario is actually OK. But the issue is:

If yt-dlp crashes/fails mid-write, partial file remains. Then cleanup tries to delete it. Then user tries to re-download same URL → different download_id → partial file already exists in new directory? No, UUID is different.

Wait, re-examining: The download_dir is `storage/downloaded-videos/{download_id}`. Since each download has unique UUID, concurrent downloads are isolated. But there's still a race:

**Actual Race Condition:** If cleanup service runs while a download is writing:
- Cleanup checks `created_at < cutoff_timestamp`
- If download was created > 60 min ago but still downloading (stuck)
- Cleanup deletes the directory → `shutil.rmtree(download_dir)` while yt-dlp is writing
- Results in: File not found errors, partial uploads

**Impact:** Lost/corrupted downloads, orphaned processes.

**Fix:**
Add "status" check to cleanup - don't delete in-progress downloads:

```python
async def cleanup_old_video_downloads(self):
    """Clean up old video downloads from filesystem and database."""
    try:
        expiration = settings.JOB_EXPIRATION_MINUTES
        if expiration is None:
            return
        cutoff = datetime.utcnow().timestamp() - (expiration * 60)
        
        # Clean up filesystem
        video_storage = Path("storage/downloaded-videos")
        if video_storage.exists():
            for download_dir in list(video_storage.iterdir()):
                try:
                    if (
                        download_dir.is_dir()
                        and download_dir.stat().st_mtime < cutoff
                    ):
                        # ✅ NEW: Check DB to ensure download is completed/failed, not in progress
                        download_id = download_dir.name
                        try:
                            async with AsyncSessionLocal() as session:
                                repo = VideoDownloadRepository(session)
                                download = await repo.get_by_id(uuid.UUID(download_id))
                                
                                # Only delete if completed, failed, or doesn't exist in DB
                                if download and download.status in ["downloading", "processing", "pending"]:
                                    logger.warning(
                                        f"Skipping cleanup of in-progress download {download_id} status={download.status}"
                                    )
                                    continue
                        except (ValueError, Exception) as e:
                            logger.warning(f"Could not check status of {download_id}: {e}, skipping cleanup")
                            continue
                        
                        shutil.rmtree(download_dir)
                        logger.info(f"Deleted old video download directory: {download_dir}")
                except (FileNotFoundError, OSError) as e:
                    logger.error(f"Error deleting directory {download_dir}: {e}")
        
        # Clean up database records (only completed/failed downloads)
        try:
            from app.db.session import AsyncSessionLocal
            from app.db.repositories.video import VideoDownloadRepository
            
            async with AsyncSessionLocal() as session:
                repo = VideoDownloadRepository(session)
                count = await repo.delete_old_downloads(cutoff)
                await session.commit()
                if count > 0:
                    logger.info(f"Deleted {count} old video download records from database")
        except Exception as e:
            logger.error(f"Error cleaning up video download database records: {e}")
    
    except Exception as e:
        logger.error(f"Video download cleanup error: {e}")
```

---

## HIGH SEVERITY ISSUES

### 🟠 ISSUE #4: Unsafe File Handling - Partial Download Not Cleaned
**Severity:** HIGH  
**File:** `app/services/video_download_service.py`, line ~115-120  
**Problem:** If yt-dlp fails after partial download, the partial file remains and cleanup won't delete it properly (it's in a UUID directory, cleanup will eventually get it, but until then it wastes space).

More critically: After download fails, if user retries, a NEW UUID directory is created. But if yt-dlp uses same filename, and the old partial file is still there, different directory so no collision. OK.

**Actually**: The real issue is that cleanup checks `completed_at < cutoff` but we fixed that. However, the bigger issue is:

If a download fails and is marked as "failed", we should still try to clean up its partial files. Currently cleanup only cleans by timestamp, not by status.

**Fix:** Cleanup should also handle "failed" status downloads:

```python
# In repository
async def delete_old_downloads(self, cutoff_timestamp: float) -> int:
    """Delete completed/failed downloads older than cutoff timestamp."""
    result = await self.session.execute(
        select(VideoDownload).where(
            (VideoDownload.completed_at.isnot(None)) &  # Has completed_at timestamp
            (
                (VideoDownload.status == "completed") |
                (VideoDownload.status == "failed")  # ✅ Add failed downloads
            ) &
            (VideoDownload.created_at < datetime.fromtimestamp(cutoff_timestamp))
        )
    )
    downloads = result.scalars().all()
    
    for download in downloads:
        await self.session.delete(download)
    
    await self.session.flush()
    return len(downloads)
```

---

### 🟠 ISSUE #5: Unsafe URL in Logs - Information Disclosure
**Severity:** HIGH  
**File:** `app/services/video_download_service.py`, line ~83, `app/routes/videos.py` line ~36  
**Problem:** URLs are logged in plaintext. If someone shares an Instagram URL with authentication token or YouTube channel access URL, it's now in logs that might be exported or monitored.

```python
logger.info(f"Starting download: {download_id}, type={download_type}, url={url[:80]}...")
# Logs: "Starting download: 550e8400-e29b, type=audio, url=https://www.instagram.com/reel/AbCdEfG?ig_..."
```

**Impact:** Credential leak through logs, privacy violation.

**Fix:**
```python
def _safe_log_url(self, url: str, max_len: int = 50) -> str:
    """Safe URL logging that truncates after domain."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc
        return f"{parsed.scheme}://{domain}/..."
    except:
        return "[invalid-url]"

logger.info(
    f"Starting download: {download_id}, type={download_type}, url={self._safe_log_url(url)}"
)
```

---

### 🟠 ISSUE #6: FFmpeg Dependency Not Verified
**Severity:** HIGH  
**File:** `app/services/video_download_service.py`, line ~190  
**Problem:** Audio extraction uses FFmpeg postprocessor, but app doesn't verify FFmpeg is available when video service initializes. The app checks at startup, but only logs a warning. yt-dlp will fail silently or with unclear error.

**Impact:** User queues audio download, it fails after long wait, unclear why.

**Fix:** Check FFmpeg availability specifically for video service in main.py lifespan:

```python
# In main.py lifespan startup
try:
    import yt_dlp
    # Test FFmpeg is available
    import subprocess
    result = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
    if result.returncode != 0:
        raise Exception("FFmpeg not functional")
    logger.info("FFmpeg verified for video downloads")
except Exception as e:
    logger.error(f"CRITICAL: FFmpeg not available - video downloads will fail: {e}")
    # Don't fail app startup, but alert operator
```

---

### 🟠 ISSUE #7: No File Size Limit Enforcement
**Severity:** HIGH  
**File:** `app/services/video_download_service.py`  
**Problem:** Setting `MAX_VIDEO_SIZE_MB` exists but is never checked. User could queue download of 500GB file:

```
User downloads 500GB file
→ yt-dlp starts downloading to storage/
→ Disk fills up
→ App crashes or becomes unresponsive
→ Cleanup can't run
→ System down
```

**Impact:** Denial of service, disk exhaustion.

**Fix:**
```python
# In video_download_service.py
def _download_with_ytdlp(self, url: str, download_type: str, output_dir: str) -> dict | None:
    try:
        import yt_dlp
        
        # ✅ NEW: Add max file size check
        max_bytes = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024
        
        if download_type == "audio":
            ydl_opts = {
                "format": "bestaudio/best",
                "postprocessors": [...],
                "outtmpl": os.path.join(output_dir, "%(title)s"),
                "max_filesize": max_bytes,  # ✅ Add this
                "quiet": False,
                "no_warnings": False,
                "socket_timeout": settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60,
            }
        else:
            ydl_opts = {
                "format": "best",
                "outtmpl": os.path.join(output_dir, "%(title)s"),
                "max_filesize": max_bytes,  # ✅ Add this
                "quiet": False,
                "no_warnings": False,
                "socket_timeout": settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60,
            }
```

---

### 🟠 ISSUE #8: User Deletion Leaves Orphaned Files
**Severity:** HIGH  
**File:** `app/db/models/video.py`, cascade delete  
**Problem:** User model cascade deletes all video downloads from DB when user deleted, but files remain:

```
1. User deleted from system
2. all video_downloads records deleted (ON DELETE CASCADE)
3. storage/downloaded-videos/{download_ids}/ directories remain
4. Cleanup never finds them (because DB records are gone)
5. Orphaned files accumulate
```

**Impact:** Storage leak, disk fills up.

**Fix:** Override cascade delete with custom logic:

```python
# In a cleanup function or separate maintenance task
async def cleanup_orphaned_video_files():
    """Remove video files for deleted users."""
    try:
        video_storage = Path("storage/downloaded-videos")
        if not video_storage.exists():
            return
        
        async with AsyncSessionLocal() as session:
            for download_dir in list(video_storage.iterdir()):
                try:
                    download_id = uuid.UUID(download_dir.name)
                    
                    # Check if download still exists in DB
                    repo = VideoDownloadRepository(session)
                    download = await repo.get_by_id(download_id)
                    
                    if not download:
                        # Orphaned directory
                        shutil.rmtree(download_dir)
                        logger.info(f"Deleted orphaned download directory: {download_dir}")
                except (ValueError, Exception) as e:
                    logger.error(f"Error checking {download_dir}: {e}")
    except Exception as e:
        logger.error(f"Orphaned file cleanup error: {e}")

# Call this weekly in cleanup service
```

---

### 🟠 ISSUE #9: Explicit ThreadPoolExecutor Needed
**Severity:** HIGH  
**File:** `app/services/video_download_service.py`, line ~105  
**Problem:** Uses default ThreadPoolExecutor which creates unlimited threads. If 100 users queue downloads simultaneously, 100 threads created → memory spike → system crash.

```python
loop = asyncio.get_event_loop()
info = await loop.run_in_executor(
    None,  # ❌ None means use default ThreadPoolExecutor
    self._download_with_ytdlp,
    ...
)
```

**Impact:** Resource exhaustion, OOM crash, DOS vulnerability.

**Fix:**
```python
# At module level
from concurrent.futures import ThreadPoolExecutor

# Create bounded thread pool
_download_executor = ThreadPoolExecutor(
    max_workers=5,  # Limit to 5 concurrent downloads
    thread_name_prefix="video-download-"
)

# In service
async def download_media(self, download_id: uuid.UUID, url: str, download_type: str) -> None:
    try:
        # ... existing code ...
        
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(
            _download_executor,  # ✅ Use bounded executor
            self._download_with_ytdlp,
            url,
            download_type,
            str(download_dir),
        )
```

---

## MEDIUM SEVERITY ISSUES

### 🟡 ISSUE #10: Incomplete Timeout Implementation
**Severity:** MEDIUM  
**File:** `app/services/video_download_service.py`, line ~200  
**Problem:** `socket_timeout` only applies to individual socket operations, not the entire download:

```
Download starts at 00:00
socket_timeout = 30 minutes
yt-dlp connects (0s) → timeout resets
Every 29 mins: small data chunk received → timeout resets
Result: Download can run for hours
```

**Impact:** Stuck download consumes resources, never times out.

**Fix:**
```python
import signal

def _download_with_timeout(self, url: str, download_type: str, output_dir: str) -> dict | None:
    """Download with hard timeout."""
    def timeout_handler(signum, frame):
        raise TimeoutError(f"Download timeout after {settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES} minutes")
    
    # Set alarm (Unix only)
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(settings.VIDEO_DOWNLOAD_TIMEOUT_MINUTES * 60)
    
    try:
        return self._download_with_ytdlp(url, download_type, output_dir)
    finally:
        signal.alarm(0)  # Cancel alarm
```

For Windows compatibility, use `threading.Timer` instead.

---

### 🟡 ISSUE #11: MIME Type Mismatch Risk
**Severity:** MEDIUM  
**File:** `app/routes/videos.py`, line ~210  
**Problem:** MIME type determined by `download_type` field, not actual file:

```python
if download.download_type == "audio":
    media_type = "audio/mpeg"
else:
    media_type = "video/mp4"
```

If database record is corrupted or manually modified, could serve wrong type. Better to detect from file extension or magic bytes.

**Impact:** Client browser misinterprets file, couldn't play.

**Fix:**
```python
import mimetypes

@router.get("/{download_id}/file")
async def download_file(...):
    # ... existing checks ...
    
    file_path = Path(download.file_path)
    
    # Detect MIME type from file extension
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if not mime_type:
        # Fallback to db
        mime_type = "audio/mpeg" if download.download_type == "audio" else "video/mp4"
    
    return FileResponse(file_path, media_type=mime_type, filename=filename)
```

---

### 🟡 ISSUE #12: Cookie Persistence Not Implemented
**Severity:** MEDIUM  
**File:** `app/services/video_download_service.py`, yt-dlp options  
**Problem:** Instagram and YouTube can require cookies for authenticated content or to avoid rate limiting. yt-dlp supports cookies but feature not implemented:

```python
ydl_opts = {
    # Missing: "cookiefile": str(Path.home() / ".yt-dlp_cookies.txt")
}
```

**Impact:** Instagram downloads fail frequently due to rate limiting. YouTube sign-in required content fails.

**Fix:** (Optional but recommended for Instagram)
```python
ydl_opts = {
    "format": "bestaudio/best",
    "cookiefile": str(Path.home() / ".yt-dlp" / "cookies.txt"),
    "extractor_args": {
        "youtube": {"player_client": ["web"]},
        "instagram": {"browser": "firefox"},
    },
    ...
}
```

---

### 🟡 ISSUE #13: No Pagination Validation
**Severity:** MEDIUM  
**File:** `app/routes/videos.py`, line ~100  
**Problem:** Pagination params not validated:

```python
@router.get("/me", response_model=VideoDownloadHistoryResponse)
async def get_download_history(
    skip: int = 0,      # ❌ No validation
    limit: int = 20,    # ❌ No validation
    ...
):
```

A user could request `skip=999999999999&limit=999999999999` → huge query, memory spike.

**Impact:** DOS through large queries.

**Fix:**
```python
from fastapi import Query

@router.get("/me", response_model=VideoDownloadHistoryResponse)
async def get_download_history(
    skip: int = Query(0, ge=0, le=10000),  # ✅ Add bounds
    limit: int = Query(20, ge=1, le=100),  # ✅ Add bounds
    status_filter: str | None = None,
    ...
):
```

---

### 🟡 ISSUE #14: Settings Value Never Used
**Severity:** MEDIUM  
**File:** `app/config/settings.py`, line ~27  
**Problem:** `SUPPORTED_VIDEO_PLATFORMS` defined but not used:

```python
SUPPORTED_VIDEO_PLATFORMS: list = ["youtube", "instagram"]
```

Instead, hardcoded dict in service. This creates maintenance burden - changing settings has no effect.

**Fix:**
```python
# In video_download_service.py
SUPPORTED_PLATFORMS = {
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "instagram.com": "instagram",
}

def __init__(self):
    # Validate settings
    for platform in ["youtube", "instagram"]:
        if platform not in settings.SUPPORTED_VIDEO_PLATFORMS:
            logger.warning(f"Platform {platform} not in SUPPORTED_VIDEO_PLATFORMS setting")
```

---

### 🟡 ISSUE #15: No Concurrency Limit on API
**Severity:** MEDIUM  
**File:** `app/routes/videos.py`  
**Problem:** No limit on how many downloads one user can queue:

```
User 1: POST /download → creates 1000 download records
All 1000 start downloading simultaneously
Each uses threads/memory
→ Resource exhaustion
```

**Impact:** One user can DOS the system.

**Fix:**
```python
# In routes/videos.py
@router.post("/download", ...)
async def download_video(...):
    # ... existing code ...
    
    # ✅ Check if user has too many pending downloads
    repo = VideoDownloadRepository(db)
    pending_downloads, _ = await repo.get_user_downloads(
        user_id=current_user.id,
        skip=0,
        limit=1000,
        status="pending"
    )
    
    if len(pending_downloads) >= 5:  # Max 5 pending
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pending downloads. Wait for some to complete."
        )
```

---

## LOW SEVERITY ISSUES

### 🟢 ISSUE #16: Database Query N+1 in Cleanup
**Severity:** LOW  
**File:** `app/services/cleanup_service.py`  
**Problem:** Cleanup lists all directories then queries DB one at a time:

```python
for download_dir in list(video_storage.iterdir()):  # N directories
    # For each, queries DB: N database queries
    download = await repo.get_by_id(uuid.UUID(download_id))
```

Should batch query.

**Fix:**
```python
# Batch load all existing downloads at once
async def cleanup_old_video_downloads(self):
    video_storage = Path("storage/downloaded-videos")
    if not video_storage.exists():
        return
    
    existing_dirs = set(d.name for d in video_storage.iterdir() if d.is_dir())
    
    if not existing_dirs:
        return
    
    # Single query to get all matching downloads
    async with AsyncSessionLocal() as session:
        repo = VideoDownloadRepository(session)
        result = await session.execute(
            select(VideoDownload.id).where(VideoDownload.id.in_([uuid.UUID(d) for d in existing_dirs]))
        )
        existing_in_db = set(r[0] for r in result)
    
    orphaned_dirs = existing_dirs - existing_in_db
    for dir_name in orphaned_dirs:
        shutil.rmtree(video_storage / dir_name)
```

---

### 🟢 ISSUE #17: Exception Type Specificity
**Severity:** LOW  
**File:** `app/services/video_download_service.py`, multiple  
**Problem:** Catch-all `Exception` clauses make debugging hard:

```python
except Exception as e:  # ❌ Catches everything
    logger.error(f"yt-dlp download error: {e}")
```

Should catch specific exceptions.

**Fix:**
```python
except yt_dlp.utils.DownloadError as e:
    logger.error(f"yt-dlp download error: {e}")
    raise
except yt_dlp.utils.ExtractorError as e:
    logger.error(f"yt-dlp extractor error: {e}")
    raise
except asyncio.TimeoutError:
    logger.error("Download timeout")
    raise
except Exception as e:
    logger.exception(f"Unexpected error during download: {e}")
    raise
```

---

### 🟢 ISSUE #18: FileResponse Buffer Size
**Severity:** LOW  
**File:** `app/routes/videos.py`, line ~210  
**Problem:** FileResponse uses default buffer size. For very large files, could use more memory than necessary.

**Fix:**
```python
return FileResponse(
    file_path,
    media_type=media_type,
    filename=filename,
    headers={"X-Send-File": str(file_path)},  # Nginx X-Accel-Redirect support
)
```

Or use with explicit buffer:
```python
return FileResponse(
    file_path,
    media_type=media_type,
    filename=filename,
    chunk_size=256 * 1024,  # 256KB chunks
)
```

---

### 🟢 ISSUE #19: Status Field Enum Missing
**Severity:** LOW  
**File:** `app/db/models/video.py`  
**Problem:** Status is String(50), should be Enum for type safety:

```python
status: Mapped[str] = mapped_column(String(50), ...)  # ❌ Can be any string
```

Could allow invalid statuses like "processing_failed_halted".

**Fix:**
```python
from enum import Enum
from sqlalchemy import Enum as SQLEnum

class VideoDownloadStatus(str, Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class VideoDownload(Base):
    status: Mapped[VideoDownloadStatus] = mapped_column(
        SQLEnum(VideoDownloadStatus),
        default=VideoDownloadStatus.PENDING,
        nullable=False
    )
```

---

### 🟢 ISSUE #20: Missing Request Validation Constraint
**Severity:** LOW  
**File:** `app/schemas/video.py`  
**Problem:** `VideoDownloadRequest` doesn't validate URL format before sending to service:

```python
class VideoDownloadRequest(BaseModel):
    url: str = Field(...)  # Any string accepted
```

Could have invalid URLs like "just_some_text".

**Fix:**
```python
from pydantic import HttpUrl, validator

class VideoDownloadRequest(BaseModel):
    url: str = Field(
        ...,
        description="YouTube or Instagram URL"
    )
    download_type: str = Field(...)
    
    @validator('url')
    def validate_url_format(cls, v):
        try:
            from urllib.parse import urlparse
            parsed = urlparse(v)
            if not parsed.scheme or not parsed.netloc:
                raise ValueError("Invalid URL format")
            return v
        except Exception:
            raise ValueError("Invalid URL format")
```

---

## RECOMMENDED IMPROVEMENTS (High Value)

### 1. **Progress Tracking via Status Polling** (MEDIUM EFFORT, HIGH VALUE)
Allow client to poll progress:

```python
# Track progress in model
class VideoDownload:
    progress_percent: int | None  # 0-100
    bytes_downloaded: int | None
    speed_mbps: float | None
```

Update during download, client can show progress bar.

### 2. **WebSocket Progress Updates** (HIGH EFFORT, VERY HIGH VALUE)
Real-time progress via WebSocket instead of polling - reduces API load by 100x.

### 3. **Resumable Downloads** (HIGH EFFORT, MEDIUM VALUE)
Store partial file markers, allow resume on failure.

### 4. **Redis Queue for Scalability** (MEDIUM EFFORT, HIGH VALUE)
Replace BackgroundTasks with Celery + Redis for:
- Multi-worker scaling
- Task persistence across restarts
- Better error handling
- Progress tracking

### 5. **Rate Limiting** (LOW EFFORT, HIGH VALUE)
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/download")
@limiter.limit("10/hour")  # Max 10 downloads per hour per user
async def download_video(...):
    pass
```

### 6. **Thumbnail Extraction** (MEDIUM EFFORT, MEDIUM VALUE)
Store thumbnail from yt-dlp info, serve in history response - better UX.

### 7. **Metadata Caching** (LOW EFFORT, MEDIUM VALUE)
Cache video metadata (title, duration, thumbnail) to avoid repeated requests.

---

## WINDOWS COMPATIBILITY NOTES

- **Issue:** `Path.cwd()` with UNC paths might not resolve correctly
- **Fix:** Use `Path(__file__).parent.resolve()` as base
- **Issue:** Drive letters (C:\) vs network paths (\\server\share)
- **Fix:** Test in Docker and on actual Windows system
- **Issue:** File permissions differ on NTFS
- **Fix:** Ensure app has read/write to storage directories

---

## DEPLOYMENT CHECKLIST

- [ ] Apply all CRITICAL fixes before production
- [ ] Test with 5+ concurrent downloads
- [ ] Verify FFmpeg available at runtime
- [ ] Storage directory is persistent (not ephemeral in Docker)
- [ ] Cleanup service runs and deletes old files
- [ ] Monitor disk space usage
- [ ] Test Instagram URL validation thoroughly
- [ ] Test YouTube private/restricted content handling
- [ ] Set up alerts for cleanup failures
- [ ] Document storage cleanup procedures
- [ ] Set MAX_VIDEO_SIZE_MB appropriate to disk
- [ ] Set VIDEO_DOWNLOAD_TIMEOUT_MINUTES based on network

---

## CRITICAL FIXES SUMMARY

Apply these 3 fixes immediately:

1. **Repository cleanup query** - Fix NULL comparison
2. **SSRF validation** - Add IPv6/private IP checks  
3. **Concurrent download race condition** - Check DB status before cleanup deletion

These will prevent:
- Database corruption (cleanup never runs)
- Internal network attacks
- Lost downloads, data corruption

All fixes provided above with exact code snippets.
