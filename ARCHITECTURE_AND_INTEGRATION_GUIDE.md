# FastAPI Project Architecture & Integration Guide

## Executive Summary

This is a production-ready **FastAPI SaaS platform** that provides Text-to-Speech (TTS) and AI Image Generation services. The architecture emphasizes **scalability**, **user isolation**, **async processing**, and **safe file operations**. This document provides a complete analysis for safely integrating new features without breaking existing functionality.

---

## 1. Project Folder Structure

### Complete Tree Structure

```
python-tts-service/
├── alembic.ini                          # Database migration config
├── Dockerfile                           # Container deployment
├── requirements.txt                     # Python dependencies
├── run_tests.py                         # Test runner
├── README.md                            # Project overview
├── IMAGE_GENERATION_IMPLEMENTATION.md   # Feature documentation
│
├── app/
│   ├── __init__.py
│   ├── main.py                          # FastAPI entry point + lifespan
│   │
│   ├── config/
│   │   ├── __init__.py
│   │   └── settings.py                  # Configuration & environment variables
│   │
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── jwt.py                       # JWT token creation/validation
│   │   ├── service.py                   # Authentication business logic
│   │   ├── dependencies.py              # FastAPI dependency injection
│   │   ├── schemas.py                   # Pydantic models (UserCreate, Login, etc.)
│   │   └── utils.py                     # Auth helper functions
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py                      # SQLAlchemy DeclarativeBase
│   │   ├── base_class.py                # (Legacy) Base class definition
│   │   ├── session.py                   # Database connection, engine, session factory
│   │   ├── migrations/                  # Alembic migration files (versioning)
│   │   │
│   │   ├── models/                      # SQLAlchemy ORM models (database tables)
│   │   │   ├── __init__.py
│   │   │   ├── user.py                  # User table & relationships
│   │   │   ├── audio.py                 # AudioGeneration table
│   │   │   ├── image.py                 # ImageGeneration table
│   │   │   └── token.py                 # RefreshToken table
│   │   │
│   │   └── repositories/                # Data access layer (Repository pattern)
│   │       ├── __init__.py
│   │       ├── user.py                  # UserRepository (CRUD for users)
│   │       ├── audio.py                 # AudioGenerationRepository
│   │       ├── image.py                 # ImageGenerationRepository
│   │       └── token.py                 # RefreshTokenRepository
│   │
│   ├── models/                          # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── jobs.py                      # JobProgress, JobStatus enums
│   │   ├── schemas.py                   # (Possible generic schemas)
│   │   └── tts.py                       # TTSRequest, LongTTSRequest
│   │
│   ├── routes/                          # FastAPI routers (endpoint handlers)
│   │   ├── __init__.py
│   │   ├── auth.py                      # /api/v1/auth/* endpoints
│   │   ├── tts.py                       # /api/v1/tts/* endpoints
│   │   ├── generations.py               # /api/v1/generations/* endpoints (history)
│   │   ├── health.py                    # /api/v1/health endpoint
│   │   └── images.py                    # /api/v1/images/* endpoints
│   │
│   ├── schemas/                         # Response model schemas
│   │   └── image.py                     # ImageGenerationRequest, ImageGenerationResponse
│   │
│   ├── services/                        # Business logic layer
│   │   ├── __init__.py
│   │   ├── tts_service.py               # Text-to-speech generation logic
│   │   ├── generation_service.py        # Shared generation utilities
│   │   ├── image_service.py             # Stable Diffusion model & generation
│   │   ├── job_service.py               # In-memory job tracking
│   │   └── cleanup_service.py           # Scheduled cleanup of old files/jobs
│   │
│   ├── utils/                           # Utility functions
│   │   ├── __init__.py
│   │   ├── logger.py                    # Loguru configuration
│   │   ├── audio_merger.py              # FFmpeg-based audio merging
│   │   ├── text_chunker.py              # Text splitting for parallel processing
│   │   └── pydub_patch.py               # Pydub monkey patch
│   │
│   └── static/
│       ├── index.html                   # Frontend SPA entry point
│       ├── fonts/                       # Web fonts
│       └── css/, js/                    # Frontend assets
│
├── frontend/                            # Vite + TypeScript React app
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│
├── ffmpeg/                              # (Bundled) FFmpeg binaries
│   ├── Makefile
│   ├── libavcodec/, libavformat/, etc.  # FFmpeg source/binaries
│   └── ...
│
├── generated_audio/                     # Output directory for TTS files
├── generated-images/                    # Output directory for image files (symlink to storage/)
├── storage/generated-images/            # Persistent image storage
├── temp_chunks/                         # Temporary chunks for long audio processing
├── logs/                                # Application logs (loguru)
├── static/                              # Served static files
└── venv/                                # Python virtual environment

```

### Folder Purpose Reference

| Folder | Purpose |
|--------|---------|
| `app/config/` | Centralized settings from `.env` and environment variables |
| `app/auth/` | JWT, OAuth, user authentication & authorization |
| `app/db/` | Database connection, ORM models, repositories, migrations |
| `app/routes/` | HTTP endpoint handlers organized by feature |
| `app/services/` | Business logic, external API calls, background processing |
| `app/models/` | Pydantic schemas (request/response validation) |
| `app/schemas/` | Response model definitions |
| `app/utils/` | Shared utility functions (logging, audio processing, etc.) |
| `app/static/` | Frontend SPA and served static assets |
| `generated_audio/` | Stored audio files (cleanup service manages expiration) |
| `storage/generated-images/` | Stored image files (cleanup service manages) |
| `temp_chunks/` | Temporary files during long audio processing |

---

## 2. FastAPI Application Architecture

### Entry Point: `app/main.py`

The application is initialized in `main.py` with the following structure:

```python
# 1. IMPORTS & PATCHES
- Pydub FFmpeg monkey patch
- FFmpeg path detection from config

# 2. APP FACTORY
app = FastAPI(
    title="Edge TTS Service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,  # Async context manager for startup/shutdown
)

# 3. MIDDLEWARE STACK
- CORSMiddleware: Allow localhost:5173 (Vite dev), localhost:8000
- Custom HTTP middleware: Security headers, request logging

# 4. EXCEPTION HANDLERS
- HTTPException handler (returns structured error response)
- Global exception handler (catches all unhandled exceptions)

# 5. STATIC FILES
- Mount /static for serving frontend SPA
- GET / returns index.html (frontend routing)

# 6. ROUTER REGISTRATION
- include_router(health.router)
- include_router(auth.router)
- include_router(tts.router)
- include_router(generations.router)
- include_router(images.router)
```

### Lifespan Events: Startup & Shutdown

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ========== STARTUP ==========
    - Validate FFmpeg is available (critical for audio)
    - Validate database connection
    - Create required directories (audio_path, temp_path, log_path, image storage)
    - Initialize image generation service (loads Stable Diffusion model)
    - Start cleanup service background task
    
    yield  # App runs here
    
    # ========== SHUTDOWN ==========
    - Stop cleanup service
    - Cancel cleanup background task
```

### Router Registration

**Each router is a feature module** with related endpoints:

| Router | Prefix | Purpose |
|--------|--------|---------|
| `health.py` | `/api/v1/health` | Liveness/readiness probes |
| `auth.py` | `/api/v1/auth` | User registration, login, refresh tokens, OAuth |
| `tts.py` | `/api/v1/tts` | TTS generation (short/long) |
| `generations.py` | `/api/v1/generations` | User's generation history |
| `images.py` | `/api/v1/images` | Image generation, history, retrieval |

### Middleware Stack

```
HTTP Request
    ↓
[1] CORS Middleware
    - Allow: localhost:5173, localhost:8000
    - Allow credentials: true
    - Allow all methods/headers
    ↓
[2] Custom Security Middleware
    - Adds security headers (COEP, COOP, CSP)
    - Logs request method, path, status, response time
    ↓
[3] FastAPI Exception Handling
    - HTTPException handler (400/401/403/404/500)
    - Global exception handler (500)
    ↓
HTTP Response
```

### Dependency Injection Pattern

FastAPI uses **function-level dependency injection** via `Depends()`:

```python
# Example from routes/tts.py
@router.post("/generate")
async def generate_tts(
    request: TTSRequest,
    current_user: User = Depends(get_current_user),  # Auth dependency
    db: AsyncSession = Depends(get_db),              # DB session dependency
):
    # Dependencies are automatically resolved and injected
```

**Key dependency chain:**
```
get_current_user()
    ↓
requires HTTPAuthorizationCredentials (from Authorization header)
    ↓
requires UserRepository
    ↓
requires AsyncSession (get_db)
    ↓
requires engine (from session.py)
```

### Background Services

**1. Cleanup Service** (runs during app lifetime)
   - Scheduled cleanup task runs every 30 minutes (configurable)
   - Deletes expired job records from memory
   - Deletes old audio/image files (older than JOB_EXPIRATION_MINUTES)
   - Runs in background, doesn't block API

**2. Image Generation Service** (singleton, initialized at startup)
   - Loads Stable Diffusion model once on app start
   - Reused for all image generation requests
   - Detects GPU/CPU availability automatically
   - Prevents model reload overhead

**3. BackgroundTasks** (per-request async tasks)
   - Used for non-blocking background work
   - Example: `background_tasks.add_task(generate_image_background, ...)`
   - Task runs after response is sent to client

### Startup/Shutdown Events

```python
# STARTUP (in lifespan)
✓ FFmpeg validation
✓ Database connection test
✓ Directory creation (audio, temp, logs, image storage)
✓ Image service initialization (model loading)
✓ Cleanup service startup

# SHUTDOWN (in lifespan)
✓ Cleanup service stop
✓ Cleanup task cancellation
```

---

## 3. Authentication & Authorization

### JWT Flow Diagram

```
┌─── Client Signup/Login ───┐
│                           │
v                           v
POST /api/v1/auth/signup   POST /api/v1/auth/login
│                           │
└─────────────┬─────────────┘
              │
              v
    AuthService.signup() / .login()
              │
              ├─ Validate credentials (login) / Check email exists (signup)
              ├─ Hash password (signup only) with bcrypt
              ├─ Create user in DB
              │
              v
    Generate JWT Tokens (jwt.py)
              │
              ├─ Access Token (short-lived, 15 minutes)
              │  Payload: {"sub": user_id, "exp": timestamp}
              │  Secret: JWT_SECRET_KEY
              │
              └─ Refresh Token (long-lived, 7 days)
                 Payload: {"sub": user_id, "jti": uuid, "exp": timestamp}
                 Secret: JWT_REFRESH_SECRET_KEY
              │
              v
    Return: {access_token, refresh_token, token_type: "bearer"}
              │
              v
Client stores tokens (localStorage, HttpOnly cookie)
```

### Access Token Validation (Per Request)

```
HTTP Request with Authorization Header
│
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
│
v
FastAPI extracts Bearer token
│
v
get_current_user(credentials: HTTPAuthorizationCredentials)
│
├─ decode_access_token(token)
│  └─ jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
│     ├─ Valid signature? ✓
│     ├─ Not expired? ✓
│     ├─ Extract "sub" (user_id) ✓
│
├─ user_repo.get(user_id)
│  └─ Query DB: SELECT * FROM users WHERE id = ?
│
├─ user.is_active == True? ✓
│
v
Return: User object (injected into route handler)
│
If ANY check fails:
v
HTTPException(status_code=401, detail="Could not validate credentials")
```

### Refresh Token Flow

```
POST /api/v1/auth/refresh
│
├─ decode_refresh_token(token)
│  └─ jwt.decode(token, JWT_REFRESH_SECRET_KEY, algorithms=["HS256"])
│
├─ Check jti not in revoked tokens (future: implement token blacklist in Redis)
│
├─ Check user still exists and is_active
│
v
Generate NEW access_token (same user_id)
│
Return: {access_token, token_type: "bearer"}
```

### Google OAuth Integration

```
POST /api/v1/auth/google
Content-Type: application/json
{
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ..."
}
│
v
AuthService.google_login()
│
├─ Verify ID token with Google public keys
│
├─ Extract: email, full_name, avatar_url, google_sub
│
├─ Check if user exists (by email or google_sub)
│  ├─ If EXISTS: Update auth_provider, return tokens
│  └─ If NEW: Create user with auth_provider="google"
│
v
Return: {access_token, refresh_token, token_type: "bearer"}
```

### Current Auth Middleware & Dependencies

**Files:**
- `app/auth/jwt.py`: Token creation/decoding
- `app/auth/dependencies.py`: FastAPI dependency functions
- `app/auth/service.py`: Business logic
- `app/auth/schemas.py`: Pydantic models
- `app/auth/utils.py`: Helper functions

**Key Functions:**
- `get_current_user()`: Returns authenticated User or raise 401
- `get_current_user_optional()`: Returns User or None (no error)
- `create_access_token()`: Generate access token
- `create_refresh_token()`: Generate refresh token
- `decode_access_token()`: Verify & parse access token
- `decode_refresh_token()`: Verify & parse refresh token

**Config in `settings.py`:**
```python
JWT_SECRET_KEY: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
JWT_REFRESH_SECRET_KEY: str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
REFRESH_TOKEN_EXPIRE_DAYS: int = 7
GOOGLE_CLIENT_ID: str = ""  # To be configured
```

---

## 4. Database Layer

### ORM: SQLAlchemy 2.x (Async)

**Configuration:**
```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Engine: PostgreSQL with asyncpg driver
DATABASE_URL = "postgresql+asyncpg://user:password@host:5432/db_name"
engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,      # Connection health check
    echo=False,              # SQL query logging (disable in production)
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Don't expire objects after commit
    autocommit=False,        # Manual commit required
    autoflush=False,         # Manual flush required
)
```

### Database Models

**User Model** (`app/db/models/user.py`)
```python
class User(Base):
    __tablename__ = "users"
    
    id: UUID (Primary Key)
    email: String(255) [UNIQUE, INDEXED]
    password_hash: String(255) [Optional]
    full_name: String(255)
    avatar_url: String(1024) [Optional]
    auth_provider: String(50) [Default: "local"]  # "local", "google", etc.
    is_active: Boolean [Default: True]
    is_verified: Boolean [Default: False]
    plan: String(50) [Default: "free"]
    credits: Integer [Default: 100]
    created_at: DateTime [UTC]
    
    # Relationships (one-to-many)
    audio_generations: List[AudioGeneration]
    image_generations: List[ImageGeneration]
    refresh_tokens: List[RefreshToken]
```

**AudioGeneration Model** (`app/db/models/audio.py`)
```python
class AudioGeneration(Base):
    __tablename__ = "audio_generations"
    
    id: UUID (Primary Key)
    user_id: UUID (Foreign Key → users.id, ON DELETE CASCADE)
    job_id: String(255) [UNIQUE, INDEXED]
    type: String(50)  # "short" or "long"
    status: String(50)  # "pending", "processing", "completed", "failed"
    voice: String(100)  # "en-US-JennyNeural", etc.
    text_length: Integer  # Characters processed
    audio_path: String(1024) [Optional]  # Relative or absolute path
    created_at: DateTime [UTC]
    completed_at: DateTime [UTC, Optional]
    
    # Relationships
    user: User (many-to-one)
    
    # Indexes
    idx_user_id
    idx_created_at
    idx_user_id_created_at (composite)
    idx_user_id_job_id (composite)
```

**ImageGeneration Model** (`app/db/models/image.py`)
```python
class ImageGeneration(Base):
    __tablename__ = "image_generations"
    
    id: UUID (Primary Key)
    user_id: UUID (Foreign Key → users.id, ON DELETE CASCADE)
    prompt: String(2048)
    status: String(50)  # "pending", "processing", "completed", "failed"
    image_path: String(1024) [Optional]
    provider: String(100)  # "stable-diffusion-v1-5"
    generation_time_seconds: Float [Optional]
    error_message: String(1024) [Optional]
    created_at: DateTime [UTC]
    completed_at: DateTime [UTC, Optional]
    
    # Relationships
    user: User (many-to-one)
    
    # Indexes
    idx_user_id
    idx_created_at
    idx_user_id_created_at (composite)
    idx_status
```

**RefreshToken Model** (`app/db/models/token.py`)
```python
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    
    id: UUID (Primary Key)
    user_id: UUID (Foreign Key → users.id, ON DELETE CASCADE)
    jti: String(255) [UNIQUE, INDEXED]  # JWT ID (from token)
    created_at: DateTime [UTC]
    expires_at: DateTime [UTC]
    
    # Relationships
    user: User (many-to-one)
```

### Session Management

**Per-Request Session:**
```python
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session  # Provided to route handler
        except Exception:
            await session.rollback()  # Rollback on error
            raise
        finally:
            await session.close()  # Always close
```

**Usage in Routes:**
```python
@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)  # Fresh session per request
):
    # db is valid for this request only
    # After response sent, session is closed
```

### Repository Pattern

**Repositories** provide a data access abstraction layer:

- `UserRepository`: CRUD for users
- `AudioGenerationRepository`: CRUD + custom queries for audio
- `ImageGenerationRepository`: CRUD + custom queries for images
- `RefreshTokenRepository`: CRUD + token management

**Example: AudioGenerationRepository**
```python
class AudioGenerationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create(self, **kwargs) -> AudioGeneration:
        # Create new record
        
    async def get(self, id: UUID) -> AudioGeneration | None:
        # Fetch by ID
        
    async def get_user_generations(
        self, 
        user_id: UUID, 
        skip: int, 
        limit: int,
        status: str | None
    ) -> List[AudioGeneration]:
        # Fetch paginated generations for a user
        
    async def get_by_job_id(self, job_id: str) -> AudioGeneration | None:
        # Fetch by job_id (for background task updates)
```

### Alembic Migrations

**System:** Alembic (SQLAlchemy migration tool)

**Location:** `app/db/migrations/versions/`

**Migration Workflow:**
```bash
# Create new migration (auto-detect schema changes)
alembic revision --autogenerate -m "Add new table"

# Apply migration
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

**Current Migrations:**
- Initial schema (users, audio_generations, image_generations, refresh_tokens)

### Database Startup Validation

```python
async def validate_db_connection() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database connection validation failed: {e}")
        return False
```

---

## 5. Existing API Modules

### TTS Module (`app/routes/tts.py`)

**Endpoints:**

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/v1/tts/generate` | Generate short audio (≤5000 chars) | ✓ |
| POST | `/api/v1/tts/long/generate` | Generate long audio (≤50000 chars, background) | ✓ |
| GET | `/api/v1/tts/jobs/{job_id}` | Get job status & progress | ✓ |
| GET | `/api/v1/tts/download/{job_id}` | Download generated audio file | ✓ |

**Request/Response Flow:**

```
POST /api/v1/tts/generate
├─ Dependency: get_current_user → User
├─ Dependency: get_db → AsyncSession
├─ Request body validation (TTSRequest)
│  └─ text: str [1-5000 chars]
│  └─ voice: str (default: "en-US-GuyNeural")
│  └─ rate: str (default: "+0%")
│  └─ pitch: str (default: "+0Hz")
│
├─ Service: tts_service.generate_speech(text, voice, rate, pitch)
│  └─ Call edge-tts library
│  └─ Return MP3 bytes
│
├─ Create job in memory: job_id = uuid4()
├─ Save MP3 file: generated_audio/{job_id}.mp3
│
├─ DB: AudioGenerationRepository.create()
│  └─ INSERT INTO audio_generations (user_id, job_id, status, ...)
│
└─ Response: 200 OK
   └─ FileResponse(audio_file, media_type="audio/mpeg")
```

**Service Layer Used:** `app/services/tts_service.py`

**File Handling:**
- Short audio: Saved to `generated_audio/{short_job_id}.mp3`
- Long audio: Chunks saved to `temp_chunks/`, merged to `generated_audio/{long_job_id}.mp3`
- Cleanup: Files deleted if older than JOB_EXPIRATION_MINUTES

**Background Jobs:**
```python
# For long audio generation
@router.post("/api/v1/tts/long/generate")
async def generate_long_tts(
    request: LongTTSRequest,
    background_tasks: BackgroundTasks,
    ...
):
    job_id = uuid4()
    background_tasks.add_task(
        background_long_audio,
        job_id=job_id,
        request=request,
        user_id=current_user.id
    )
    return {"job_id": job_id, "status": "pending"}
```

### Generations Module (`app/routes/generations.py`)

**Purpose:** User's generation history & statistics

**Endpoints:**

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/api/v1/generations/me` | Get user's generation history (paginated) | ✓ |
| GET | `/api/v1/generations/stats` | Get user's generation statistics | ✓ |

**Request/Response Flow:**

```
GET /api/v1/generations/me?skip=0&limit=20&status=completed
│
├─ Dependency: get_current_user → User
├─ Query params: skip, limit, status (filter)
│
├─ Service: AudioGenerationRepository.get_user_generations()
│  └─ SELECT * FROM audio_generations
│     WHERE user_id = ? AND status = ?
│     ORDER BY created_at DESC
│     LIMIT ? OFFSET ?
│
└─ Response: 200 OK
   └─ {
        items: [
          {id, job_id, type, status, voice, text_length, audio_path, created_at, completed_at},
          ...
        ],
        total: 150,
        page: 1,
        page_size: 20
      }
```

### Images Module (`app/routes/images.py`)

**Endpoints:**

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/v1/images/generate` | Queue image generation (returns 202) | ✓ |
| GET | `/api/v1/images/history` | Get user's image history | ✓ |
| GET | `/api/v1/images/{id}` | Get image details (status, download link) | ✓ |
| GET | `/api/v1/images/{id}/download` | Download image file | ✓ |

**Request/Response Flow:**

```
POST /api/v1/images/generate
├─ Request: {prompt: "A serene mountain landscape"}
├─ Create pending record in DB
├─ Schedule background task: _generate_image_background()
└─ Response: 202 Accepted
   └─ {id, status: "pending", prompt, ...}

Background Task:
├─ image_service.generate_image(prompt)
│  └─ Load Stable Diffusion model (cached on first use)
│  └─ Generate image from prompt
│  └─ Save to storage/generated-images/{uuid}.png
├─ Update DB record: status = "completed", image_path = "..."
└─ Log completion
```

**Service Layer Used:** `app/services/image_service.py`

**File Handling:**
- Images stored: `storage/generated-images/{uuid}.png`
- Cleanup: Files deleted if older than JOB_EXPIRATION_MINUTES
- Retrieved via: `GET /api/v1/images/{id}/download` (authenticated)

---

## 6. Existing File Storage System

### Storage Folders

| Folder | Purpose | Cleanup | Permissions |
|--------|---------|---------|-------------|
| `generated_audio/` | TTS output files (MP3) | Yes (by age) | 644 (readable) |
| `storage/generated-images/` | AI-generated images (PNG) | Yes (by age) | 644 (readable) |
| `temp_chunks/` | Temporary audio chunks during processing | Yes (by age) | 644 (readable) |
| `logs/` | Application logs (loguru) | Manual | 644 (readable) |
| `app/static/` | Frontend SPA & assets | No | 644 (readable) |

### Cleanup Service

**File:** `app/services/cleanup_service.py`

**Lifecycle:**
1. Started at app startup (lifespan)
2. Runs every 30 minutes (configurable: `CLEANUP_INTERVAL_MINUTES`)
3. Tasks:
   - Clean expired jobs from memory (job_service)
   - Delete files older than `JOB_EXPIRATION_MINUTES` (default: 60 min)
4. Stopped at app shutdown

**Implementation:**
```python
async def cleanup_old_files(self):
    cutoff = datetime.utcnow().timestamp() - (expiration * 60)
    
    for dir_path in [settings.audio_path, settings.temp_path]:
        for file_path in list(dir_path.iterdir()):
            if file_path.is_file() and file_path.stat().st_mtime < cutoff:
                file_path.unlink()
                logger.info(f"Deleted old file: {file_path}")
```

### File Naming Strategy

**TTS Files:**
- Short: `short_{uuid}.mp3`
- Long: `long_{uuid}.mp3`

**Temp Chunks (Long Audio):**
- `chunk_{uuid}_{chunk_index}.mp3`

**Image Files:**
- `{generation_id}.png` (UUID format)

**Database Reference:**
- audio_path: Stored relative to storage root
- image_path: Stored relative to storage root

### Static/File Serving Logic

**Static Assets:**
```python
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/")
async def serve_frontend():
    return FileResponse("app/static/index.html")
```

**Generated Files (Authenticated):**
```python
@router.get("/api/v1/tts/download/{job_id}")
async def download_audio(
    job_id: str,
    current_user: User = Depends(get_current_user),
    ...
):
    # Verify ownership
    generation = await repo.get_generation_for_user(job_id, user_id=current_user.id)
    if not generation:
        raise HTTPException(404, "Not found")
    
    # Return file
    file_path = settings.audio_path / generation.audio_path
    return FileResponse(file_path, media_type="audio/mpeg")
```

**Security:**
- Files accessible only via authenticated endpoints
- User can only download their own files
- File paths validated before serving (no path traversal)

---

## 7. Existing Image Generation System

### Pipeline Initialization

**Model:** Stable Diffusion v1.5 (via Hugging Face Diffusers)

**File:** `app/services/image_service.py`

**Initialization Flow:**

```
App Startup (lifespan)
│
├─ image_service.initialize()
│  │
│  ├─ _detect_device() → "cuda" or "cpu"
│  │
│  ├─ AutoPipelineForText2Image.from_pretrained(
│       "Lykon/dreamshaper-xl-turbo",
│       torch_dtype=torch.float16 (GPU) or float32 (CPU)
│     )
│  │
│  ├─ Move pipeline to device (GPU/CPU)
│  │
│  └─ Cache in _pipeline (singleton)
│
└─ Ready for requests
```

### Model Loading

- **Model Name:** `Lykon/dreamshaper-xl-turbo`
- **Strategy:** Singleton (load once, reuse for all requests)
- **Device Detection:** CUDA auto-detection
- **Optimization:**
  - GPU: `float16` dtype (memory efficient)
  - CPU: `float32` dtype + torch thread settings

### Queue/Background Processing

**BackgroundTasks Pattern:**

```python
@router.post("/api/v1/images/generate")
async def generate_image(
    request: ImageGenerationRequest,
    background_tasks: BackgroundTasks,
    ...
):
    # 1. Create pending DB record
    generation = await repo.create(
        user_id=current_user.id,
        prompt=request.prompt,
        provider="stable-diffusion-v1-5"
    )
    
    # 2. Queue background task
    background_tasks.add_task(
        _generate_image_background,
        generation_id=generation.id,
        prompt=request.prompt,
    )
    
    # 3. Return immediately (202 Accepted)
    return ImageGenerationResponse.from_orm(generation)

# Task runs after response sent
async def _generate_image_background(generation_id: UUID, prompt: str):
    try:
        image = await image_service.generate_image(prompt)
        image.save(file_path)
        # Update DB: status = "completed", image_path = "..."
    except Exception as e:
        # Update DB: status = "failed", error_message = "..."
```

### Database Persistence

**Table:** `image_generations`

**Status Flow:**
```
pending → processing → completed
                    ↘ failed
```

**Fields Updated:**
- `status`: "pending" → "processing" → "completed" or "failed"
- `image_path`: Path to saved image (once generated)
- `generation_time_seconds`: Time taken
- `error_message`: If failed
- `completed_at`: Timestamp when done

### Image Retrieval APIs

**Endpoints:**

1. **Get History**
   ```
   GET /api/v1/images/history?skip=0&limit=20&status_filter=completed
   ```
   Returns paginated list of user's image generations with status

2. **Get Details**
   ```
   GET /api/v1/images/{id}
   ```
   Returns single generation with:
   - status (pending/processing/completed/failed)
   - image_path (when completed)
   - error_message (when failed)
   - generation_time_seconds

3. **Download Image**
   ```
   GET /api/v1/images/{id}/download
   ```
   Returns PNG file (authenticated, ownership verified)

---

## 8. Logging & Error Handling

### Logging Framework: Loguru

**Configuration:** `app/utils/logger.py`

**Setup:**
```python
def setup_logging(log_path: Path):
    logger.add(
        log_path / "app.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        rotation="500 MB",
        retention="7 days",
        level="INFO",
    )
```

**Usage:**
```python
from loguru import logger

logger.info("Database connection validated")
logger.warning(f"HTTPException: status={exc.status_code}")
logger.error(f"Failed to initialize image service: {e}")
logger.exception(f"Unhandled exception: {str(exc)}")
```

**Log Output:**
- File: `logs/app.log` (rotated at 500 MB, kept 7 days)
- Console: Real-time info during development
- Format: Timestamp, Level, Module, Function, Line, Message

### Exception Handlers

**Global Exception Handler:**
```python
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": str(exc.detail),
            "code": "...",
        },
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "An internal server error occurred.",
            "code": "INTERNAL_SERVER_ERROR",
        },
    )
```

**Status Codes:**
- `200`: Success
- `201`: Created
- `202`: Accepted (async processing started)
- `400`: Bad request (validation error)
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found
- `500`: Internal server error

### Validation Handling

**Pydantic Validation:**
```python
class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = Field(default="en-US-GuyNeural")

# FastAPI automatically:
# 1. Validates request body matches schema
# 2. Returns 422 Unprocessable Entity if invalid
# 3. Includes detailed error messages
```

**Custom Validation (in service layer):**
```python
def validate_generation_ownership(generation, user_id):
    if generation is None:
        raise HTTPException(status_code=404, detail="Not found")
    if generation.user_id != user_id:
        raise HTTPException(status_code=404, detail="Not found")
    return generation
```

---

## 9. Configuration System

### .env Variables

**File:** `.env` (not committed, created per deployment)

**Essential Variables:**
```bash
# App
APP_NAME="Edge TTS Service"
DEBUG=False
HOST=0.0.0.0
PORT=8000

# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/ai_voice_generator

# JWT
JWT_SECRET_KEY=<random-32-char-string>
JWT_REFRESH_SECRET_KEY=<random-32-char-string>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>

# Directories
TEMP_DIR=temp_chunks
OUTPUT_DIR=generated_audio
LOG_DIR=logs

# FFmpeg
FFMPEG_PATH=/path/to/ffmpeg  # Optional, will search PATH

# Cleanup
JOB_EXPIRATION_MINUTES=60
CLEANUP_INTERVAL_MINUTES=30

# TTS
MAX_TEXT_LENGTH=50000
MAX_CHUNK_SIZE=4000
MAX_CONCURRENT_CHUNKS=3
```

### Settings Class

**File:** `app/config/settings.py`

**Pattern:** Pydantic BaseSettings (loads from .env)

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Edge TTS Service"
    DATABASE_URL: str = "postgresql+asyncpg://..."
    JWT_SECRET_KEY: str = "..."
    
    # Computed properties
    @property
    def temp_path(self) -> Path:
        return self.TEMP_DIR.resolve()
    
    @property
    def audio_path(self) -> Path:
        return self.OUTPUT_DIR.resolve()
    
    def get_ffmpeg_path(self) -> Optional[str]:
        # Tries: config path → system PATH → imageio-ffmpeg
        
    @validator('FFMPEG_PATH')
    def validate_ffmpeg_path(cls, v):
        if v is not None and not v.exists():
            raise ValueError(f"FFMPEG_PATH {v} does not exist")
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()  # Singleton instance
```

### Secrets Handling

**JWT Secrets:**
- `JWT_SECRET_KEY`: Access token signing secret (32+ characters, random)
- `JWT_REFRESH_SECRET_KEY`: Refresh token signing secret (32+ characters, random)

**Database Password:**
- Encoded in `DATABASE_URL` connection string
- Handled by SQLAlchemy URL parser
- Special characters URL-encoded by `get_encoded_db_url()`

**Google OAuth:**
- `GOOGLE_CLIENT_ID`: Public (not secret, but environment-specific)
- Google Client Secret: Should be on backend only (not in .env for security)

**Best Practices:**
- Use environment variables for secrets (not hardcoded)
- Rotate JWT secrets periodically
- Use strong random secrets (min 32 characters)
- Never commit .env file to version control

---

## 10. Existing Async/Background Processing

### FastAPI BackgroundTasks

**Purpose:** Non-blocking async work that happens after response sent

**Example: Image Generation**
```python
from fastapi import BackgroundTasks

@router.post("/api/v1/images/generate")
async def generate_image(
    request: ImageGenerationRequest,
    background_tasks: BackgroundTasks,
    ...
):
    generation = await repo.create(...)
    
    # Queue task (doesn't block response)
    background_tasks.add_task(
        _generate_image_background,
        generation_id=generation.id,
        prompt=request.prompt,
    )
    
    return ImageGenerationResponse.from_orm(generation)  # Sent immediately

# Task runs AFTER response sent (in background)
async def _generate_image_background(generation_id: UUID, prompt: str):
    image = await image_service.generate_image(prompt)
    # Update DB...
```

**Limitation:** Tasks run in-process, lost if app crashes

### Threads

**Usage:** CPU-heavy operations (image generation uses threads internally)

- Model loading: Single-threaded on startup
- Generation: Uses PyTorch/Diffusers threading
- No explicit thread management in app code

### Scheduled Tasks (Cleanup)

**Pattern:** asyncio.create_task() during lifespan

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    cleanup_task = asyncio.create_task(cleanup_service.start())
    
    yield
    
    # Shutdown
    await cleanup_service.stop()
    cleanup_task.cancel()
```

**CleanupService:**
```python
async def start(self):
    self.running = True
    while self.running:
        await self.cleanup_expired_jobs()
        await self.cleanup_old_files()
        await asyncio.sleep(settings.CLEANUP_INTERVAL_MINUTES * 60)
```

### No Redis/Celery Currently

- **Queue System:** None (BackgroundTasks only)
- **Cache:** None (model cached in memory)
- **Distributed Async:** Not implemented

**Future Considerations:**
- For horizontal scaling, implement Celery + Redis
- For advanced queue features, use RQ or similar

---

## 11. Dependency List

### Core Framework

| Package | Version | Usage |
|---------|---------|-------|
| `fastapi` | 0.110.0 | Web framework |
| `uvicorn` | 0.27.1 | ASGI server |
| `python-multipart` | 0.0.9 | Form data parsing |

### Database & ORM

| Package | Version | Usage |
|---------|---------|-------|
| `sqlalchemy[asyncio]` | ≥2.0.0 | Async ORM |
| `asyncpg` | ≥0.29.0 | PostgreSQL driver |
| `alembic` | ≥1.13.0 | Database migrations |
| `psycopg2-binary` | ≥2.9.9 | PostgreSQL adapter |

### Authentication

| Package | Version | Usage |
|---------|---------|-------|
| `python-jose[cryptography]` | ≥3.3.0 | JWT encoding/decoding |
| `passlib[bcrypt]` | ≥1.7.4 | Password hashing |
| `bcrypt` | 4.0.x | Bcrypt backend for passlib |

### Data Validation & Configuration

| Package | Version | Usage |
|---------|---------|-------|
| `pydantic` | 2.6.3 | Data validation |
| `pydantic-settings` | 2.2.1 | Settings management |

### Audio Processing

| Package | Version | Usage |
|---------|---------|-------|
| `edge-tts` | 7.2.8 | TTS engine (Microsoft voices) |
| `pydub` | 0.25.1 | Audio merging/processing |
| `aiofiles` | 23.2.1 | Async file I/O |
| `imageio-ffmpeg` | 0.6.0 | FFmpeg binaries |
| `aiohttp` | 3.9.5 | Async HTTP (for edge-tts) |

### Image Generation

| Package | Version | Usage |
|---------|---------|-------|
| `torch` | ≥2.0.0 | PyTorch (ML framework) |
| `diffusers` | ≥0.21.0 | Hugging Face Diffusers (model library) |
| `transformers` | ≥4.30.0 | Hugging Face Transformers |
| `accelerate` | ≥0.20.0 | Model acceleration |
| `Pillow` | ≥10.0.0 | Image processing |

### Utilities

| Package | Version | Usage |
|---------|---------|-------|
| `loguru` | 0.7.2 | Structured logging |
| `python-dotenv` | 1.0.1 | .env file loading |

---

## 12. API Flow Diagram

### Complete Request/Response Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser/App)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    HTTP Request
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        v                                     v
   /api/v1/auth/*                       /api/v1/tts/*
   (auth-related)                       (tts-related)
        │                                     │
        └──────────────────┬──────────────────┘
                           │
        ┌──────────────────┴──────────────────────────┐
        │                                             │
        v                                             v
   [1] FastAPI Router                          [2] FastAPI Router
   (route handler)                             (route handler)
        │                                             │
        ├─ Extract Authorization header              ├─ Extract Authorization header
        ├─ Validate request body (Pydantic)          ├─ Validate request body (Pydantic)
        │                                             │
        v                                             v
   [3] Dependency Injection                    [3] Dependency Injection
   get_current_user()                          get_current_user()
        │                                             │
        ├─ HTTPBearer extracts token                 ├─ HTTPBearer extracts token
        ├─ jwt.decode() validates signature          ├─ jwt.decode() validates signature
        ├─ UserRepository.get(user_id)               ├─ UserRepository.get(user_id)
        │                                             │
        └──→ Returns User object ──┐                 └──→ Returns User object ──┐
             (or raises 401)        │                    (or raises 401)        │
                                    │                                          │
                                    v                                          v
                            [4] Route Handler                       [4] Route Handler
                            async def signup()                      async def generate_tts()
                            async def login()                       async def get_job_status()
                            async def refresh()                     async def download_audio()
                                    │                                          │
                                    v                                          v
                            [5] Auth Service                        [5] TTS Service
                            - Hash password                         - Generate speech
                            - Create tokens                         - Merge audio
                            - Update user                           - Save to disk
                                    │                                          │
                                    v                                          v
                            [6] Database                            [6] Database
                            INSERT/UPDATE/SELECT                    INSERT/UPDATE/SELECT
                            (AsyncSession)                          (AsyncSession)
                                    │                                          │
                                    v                                          v
                         [7] PostgreSQL                    [7] PostgreSQL / File System
                         Users, Tokens                     Audio Generations, Files
                                    │                                          │
        ┌───────────────────────────┴───────────────────────────────┬──────────┘
        │                                                            │
        v                                                            v
   Response JSON                                           Response JSON / File
   {access_token, refresh_token}                          {job_id, status} / MP3 file
        │                                                            │
        └────────────────────────────┬─────────────────────────────┘
                                     │
                          HTTP Response (200/201/400/401/500)
                                     │
                                     v
        ┌────────────────────────────┴─────────────────────────────┐
        │                                                          │
        v                                                          v
   CLIENT                                                      CLIENT
   (stores tokens)                                             (displays response)
```

### Specific Flow: Short TTS Generation

```
1. CLIENT
   POST /api/v1/tts/generate
   Authorization: Bearer <access_token>
   Content-Type: application/json
   {
     "text": "Hello, world!",
     "voice": "en-US-JennyNeural",
     "rate": "+0%",
     "pitch": "+0Hz"
   }

2. FASTAPI ROUTER (app/routes/tts.py)
   @router.post("/generate")
   async def generate_tts(
       request: TTSRequest,                    # Validates JSON schema
       current_user: User = Depends(...),      # Auth dependency
       db: AsyncSession = Depends(...)         # DB session dependency
   ):

3. DEPENDENCY: get_current_user()
   - HTTPBearer extracts "Bearer <token>"
   - jwt.decode(token, JWT_SECRET_KEY)
   - Checks expiration, valid signature
   - UserRepository.get(user_id)
   - Returns User object

4. SERVICE: tts_service.generate_speech()
   - Call edge-tts library
   - Wait for MP3 bytes
   - Return audio_data

5. FILE SYSTEM
   - Save MP3: generated_audio/{job_id}.mp3

6. DATABASE
   INSERT INTO audio_generations (
       user_id, job_id, type, status,
       voice, text_length, audio_path, created_at, completed_at
   )

7. RESPONSE
   200 OK
   Content-Type: audio/mpeg
   [binary MP3 data]

8. CLIENT
   Browser receives audio file, plays it
```

---

## 13. Performance Considerations

### Current Bottlenecks

**1. Image Model Loading (GPU/CPU)**
- **Issue:** First request takes 10-60s (model download + load)
- **Solution:** Singleton pattern (load once at startup)
- **Impact:** Subsequent requests are fast (<5s for generation)

**2. Long Audio Processing (Sequential)**
- **Issue:** Long text (50,000 chars) takes time due to edge-tts rate limit
- **Solution:** Parallel chunk generation (MAX_CONCURRENT_CHUNKS)
- **Impact:** Still takes minutes for very long audio

**3. In-Process Background Tasks**
- **Issue:** Tasks lost if app crashes; no persistence
- **Solution:** Implement Celery + Redis for production
- **Impact:** Currently acceptable for small deployments

**4. File System Operations**
- **Issue:** Cleanup task reads entire directory structure
- **Solution:** Database tracking instead of filesystem scan (future optimization)
- **Impact:** Negligible for current file counts (<10k files)

### CPU Intensive Operations

**Image Generation (High CPU/GPU):**
```python
# Model inference takes time (2-10s per image)
image = pipeline(prompt, ...)  # CPU/GPU intensive

# Bottleneck: Model is shared (serialized requests)
# Solution: Async queuing or distributed inference
```

**Long Audio Processing (CPU):**
```python
# FFmpeg merging is CPU-bound
# Bottleneck: Single-threaded FFmpeg process
# Solution: Parallelize at FFmpeg level or distribute jobs
```

### File I/O Handling

**Async File Operations:**
```python
import aiofiles

# Write audio file asynchronously
async with aiofiles.open(file_path, "wb") as f:
    await f.write(audio_data)
```

**File Serving:**
```python
# FastAPI FileResponse uses efficient streaming
FileResponse(file_path, media_type="audio/mpeg")
```

---

## 14. Security Review

### Authentication Protection

✅ **JWT Token-Based:**
- Access token: 15-minute expiration (short-lived)
- Refresh token: 7-day expiration (long-lived)
- Cryptographic signatures (HS256)
- Token validation on every protected endpoint

✅ **User Verification:**
- Decode token, extract user_id
- Query user from database
- Verify user is active
- Return 401 if any check fails

✅ **Password Hashing:**
- Bcrypt with salt (passlib library)
- Not stored in plaintext

⚠️ **OAuth Flow:**
- Google ID token verification (implement with google-auth library)
- Email uniqueness check to prevent account takeover

### File Upload/Download Safety

✅ **Ownership Verification:**
```python
generation = await repo.get_generation_for_user(job_id, user_id=current_user.id)
if generation.user_id != current_user.id:
    raise HTTPException(404, "Not found")  # Don't expose existence
```

✅ **Path Validation:**
- Files stored in fixed directories (generated_audio/, storage/)
- No user-supplied filenames
- No path traversal possible (no "../" in file paths)

✅ **Access Control:**
- Download endpoints require authentication
- Check user_id matches generation owner

⚠️ **File Permissions:**
- Ensure app process has minimal file permissions
- Files readable by web server process only

### URL Validation

✅ **For Future Video Downloader:**
- Validate YouTube/Instagram URLs (use urllib.parse.urlparse)
- Whitelist allowed domains (youtube.com, instagram.com)
- Reject suspicious URLs (file://, localhost, etc.)
- Rate limit downloads per user

### Rate Limiting

⚠️ **Not Implemented:**
- No per-user rate limiting
- No per-IP rate limiting
- No concurrent request limits

**Recommendations:**
- Implement via middleware or slowapi library
- Example: 10 image generations per hour per user
- Example: 100 TTS requests per hour per user

---

## 15. Recommended Integration Plan For New Feature

### Feature: Instagram Reel / YouTube Video Downloader

**Requirements Recap:**
- User provides Instagram or YouTube URL
- User selects: Download Audio (MP3) or Download Video (MP4)
- Backend downloads media, stores safely
- Auth protected API
- Download history saved in DB
- Cleanup service support
- Future-ready for async queue/progress tracking

### Architecture Overview

```
User Request
│
├─ Validate URL (YouTube/Instagram only)
├─ Validate user permissions (auth)
├─ Create DB record (status: pending)
├─ Schedule background task
│
└─ Return immediately (202 Accepted)
   {download_id, status: "pending", ...}

Background Task:
├─ Download media (using yt-dlp library)
├─ Extract video/audio
├─ Convert to MP3/MP4
├─ Save to storage
├─ Update DB record (status: completed)
└─ Log completion/errors
```

### Database Model

**New Table: `video_downloads`**

```python
# app/db/models/video.py

class VideoDownload(Base):
    __tablename__ = "video_downloads"
    
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
    url: Mapped[str] = mapped_column(
        String(2048),
        nullable=False
    )
    platform: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )  # "youtube" or "instagram"
    download_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )  # "audio" or "video"
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending"
    )  # "pending", "downloading", "processing", "completed", "failed"
    title: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True
    )
    file_path: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True
    )
    file_size_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
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
        Index("ix_video_downloads_user_id", "user_id"),
        Index("ix_video_downloads_created_at", "created_at"),
        Index("ix_video_downloads_user_id_created_at", "user_id", "created_at"),
        Index("ix_video_downloads_status", "status"),
    )
    
    user: Mapped["User"] = relationship(
        "User",
        back_populates="video_downloads"
    )
```

**Update User Model:**
```python
# app/db/models/user.py

class User(Base):
    # ... existing fields ...
    
    # New relationship
    video_downloads: Mapped[list["VideoDownload"]] = relationship(
        "VideoDownload",
        back_populates="user",
        cascade="all, delete-orphan"
    )
```

### Repository Layer

**New File: `app/db/repositories/video.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.models.video import VideoDownload
import uuid
from typing import List

class VideoDownloadRepository:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create(self, **kwargs) -> VideoDownload:
        """Create new video download record"""
        download = VideoDownload(**kwargs)
        self.db.add(download)
        await self.db.flush()
        return download
    
    async def get(self, id: uuid.UUID) -> VideoDownload | None:
        """Fetch by ID"""
        return await self.db.get(VideoDownload, id)
    
    async def get_for_user(
        self, 
        id: uuid.UUID, 
        user_id: uuid.UUID
    ) -> VideoDownload | None:
        """Fetch by ID, verify ownership"""
        download = await self.get(id)
        if download and download.user_id == user_id:
            return download
        return None
    
    async def get_user_downloads(
        self,
        user_id: uuid.UUID,
        skip: int = 0,
        limit: int = 20,
        status: str | None = None,
    ) -> List[VideoDownload]:
        """Get paginated downloads for user"""
        query = select(VideoDownload).where(
            VideoDownload.user_id == user_id
        )
        if status:
            query = query.where(VideoDownload.status == status)
        query = query.order_by(desc(VideoDownload.created_at))
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def update_status(
        self,
        id: uuid.UUID,
        status: str,
        **kwargs
    ) -> VideoDownload | None:
        """Update download status"""
        download = await self.get(id)
        if download:
            download.status = status
            for key, value in kwargs.items():
                setattr(download, key, value)
            await self.db.flush()
        return download
```

### Service Layer

**New File: `app/services/video_download_service.py`**

```python
import uuid
import asyncio
from pathlib import Path
from datetime import datetime
from loguru import logger
import yt_dlp
from app.config.settings import settings
from app.db.repositories.video import VideoDownloadRepository

class VideoDownloadService:
    
    # Directory for video downloads
    VIDEO_STORAGE_PATH = Path("storage/downloaded-videos")
    
    def __init__(self):
        self.VIDEO_STORAGE_PATH.mkdir(parents=True, exist_ok=True)
        logger.info(f"Video download storage ready: {self.VIDEO_STORAGE_PATH}")
    
    def validate_url(self, url: str) -> tuple[bool, str]:
        """Validate URL is YouTube or Instagram"""
        from urllib.parse import urlparse
        
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            
            if "youtube.com" in domain or "youtu.be" in domain:
                return True, "youtube"
            elif "instagram.com" in domain:
                return True, "instagram"
            else:
                return False, "Unsupported platform"
        except Exception as e:
            return False, f"Invalid URL: {e}"
    
    async def download_media(
        self,
        url: str,
        download_type: str,  # "audio" or "video"
        download_id: uuid.UUID,
        repo: VideoDownloadRepository,
    ):
        """
        Background task: Download and process media
        Updates DB with progress and results
        """
        try:
            # Update status to downloading
            await repo.update_status(download_id, "downloading")
            
            # Prepare output paths
            output_path = self.VIDEO_STORAGE_PATH / str(download_id)
            output_path.mkdir(parents=True, exist_ok=True)
            
            # yt-dlp options
            if download_type == "audio":
                ydl_opts = {
                    'format': 'bestaudio/best',
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }],
                    'outtmpl': str(output_path / '%(title)s'),
                    'quiet': False,
                    'no_warnings': False,
                }
            else:  # video
                ydl_opts = {
                    'format': 'best',
                    'outtmpl': str(output_path / '%(title)s'),
                    'quiet': False,
                    'no_warnings': False,
                }
            
            # Update status to processing
            await repo.update_status(download_id, "processing")
            
            # Download (blocking, run in executor)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._download_with_ydl,
                url,
                ydl_opts,
                output_path,
                download_id,
                repo,
            )
            
        except Exception as e:
            logger.error(f"Download failed for {download_id}: {e}")
            await repo.update_status(
                download_id,
                "failed",
                error_message=str(e)[:1024],  # Truncate to DB column size
            )
    
    def _download_with_ydl(self, url: str, opts: dict, output_path: Path, download_id: uuid.UUID, repo):
        """Blocking yt-dlp download (runs in executor)"""
        import os
        
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'download')
            duration = info.get('duration', 0)
            
            # Find downloaded file
            files = list(output_path.iterdir())
            if files:
                file_path = files[0]
                file_size = os.path.getsize(file_path)
                
                # Update DB
                import asyncio
                loop = asyncio.new_event_loop()
                loop.run_until_complete(
                    repo.update_status(
                        download_id,
                        "completed",
                        title=title,
                        file_path=str(file_path.relative_to(Path.cwd())),
                        file_size_bytes=file_size,
                        duration_seconds=duration,
                        completed_at=datetime.utcnow(),
                    )
                )
                loop.close()
```

### Routes

**New File: `app/routes/videos.py`**

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.db.models.user import User
from app.db.repositories.video import VideoDownloadRepository
from app.services.video_download_service import VideoDownloadService
from loguru import logger

router = APIRouter(prefix="/api/v1/videos", tags=["videos"])
video_service = VideoDownloadService()

# ========== Request/Response Models ==========

class VideoDownloadRequest(BaseModel):
    url: str
    download_type: str  # "audio" or "video"
    
    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "download_type": "audio"
            }
        }

class VideoDownloadResponse(BaseModel):
    id: uuid.UUID
    url: str
    platform: str
    download_type: str
    status: str
    title: str | None
    file_size_bytes: int | None
    duration_seconds: int | None
    created_at: str
    
    class Config:
        from_attributes = True

# ========== Endpoints ==========

@router.post("/download", response_model=VideoDownloadResponse, status_code=status.HTTP_202_ACCEPTED)
async def download_video(
    request: VideoDownloadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """
    Queue a video/audio download from YouTube or Instagram
    
    Returns immediately (202 Accepted) with download ID
    """
    
    # Validate URL
    valid, platform_or_error = video_service.validate_url(request.url)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=platform_or_error
        )
    
    # Validate download_type
    if request.download_type not in ["audio", "video"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="download_type must be 'audio' or 'video'"
        )
    
    try:
        # Create download record
        repo = VideoDownloadRepository(db)
        download = await repo.create(
            user_id=current_user.id,
            url=request.url,
            platform=platform_or_error,
            download_type=request.download_type,
            status="pending",
        )
        await db.commit()
        
        logger.info(f"Download queued: {download.id} for user {current_user.id}")
        
        # Schedule background task
        background_tasks.add_task(
            video_service.download_media,
            url=request.url,
            download_type=request.download_type,
            download_id=download.id,
            repo=repo,
        )
        
        return VideoDownloadResponse.from_orm(download)
        
    except Exception as e:
        logger.error(f"Error creating download record: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue download"
        )

@router.get("/history", response_model=dict)
async def get_download_history(
    skip: int = 0,
    limit: int = 20,
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's download history (paginated)"""
    
    repo = VideoDownloadRepository(db)
    downloads = await repo.get_user_downloads(
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        status=status,
    )
    
    # Count total
    query = select(func.count(VideoDownload.id)).where(
        VideoDownload.user_id == current_user.id
    )
    if status:
        query = query.where(VideoDownload.status == status)
    result = await db.execute(query)
    total = result.scalar() or 0
    
    return {
        "items": [VideoDownloadResponse.from_orm(d) for d in downloads],
        "total": total,
        "page": (skip // limit) + 1,
        "page_size": limit,
    }

@router.get("/{download_id}", response_model=VideoDownloadResponse)
async def get_download_status(
    download_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get download status and details"""
    
    repo = VideoDownloadRepository(db)
    download = await repo.get_for_user(download_id, current_user.id)
    
    if not download:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Download not found"
        )
    
    return VideoDownloadResponse.from_orm(download)

@router.get("/{download_id}/download")
async def download_file(
    download_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the media file"""
    
    repo = VideoDownloadRepository(db)
    download = await repo.get_for_user(download_id, current_user.id)
    
    if not download:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Download not found"
        )
    
    if download.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Download not completed (status: {download.status})"
        )
    
    file_path = Path(download.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    media_type = "audio/mpeg" if download.download_type == "audio" else "video/mp4"
    filename = f"{download.title}.{'mp3' if download.download_type == 'audio' else 'mp4'}"
    
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=filename,
    )
```

### Cleanup Service Integration

**Update: `app/services/cleanup_service.py`**

```python
async def cleanup_old_files(self):
    try:
        expiration = settings.JOB_EXPIRATION_MINUTES
        cutoff = datetime.utcnow().timestamp() - (expiration * 60)
        
        # Existing audio/temp cleanup
        for dir_path in [settings.audio_path, settings.temp_path]:
            if not dir_path.exists():
                continue
            for file_path in list(dir_path.iterdir()):
                try:
                    if file_path.is_file() and file_path.stat().st_mtime < cutoff:
                        file_path.unlink()
                        logger.info(f"Deleted old file: {file_path}")
                except FileNotFoundError:
                    pass
        
        # NEW: Video downloads cleanup
        from pathlib import Path
        video_storage = Path("storage/downloaded-videos")
        if video_storage.exists():
            for dir_path in list(video_storage.iterdir()):
                if dir_path.is_dir() and dir_path.stat().st_mtime < cutoff:
                    import shutil
                    shutil.rmtree(dir_path)
                    logger.info(f"Deleted old video download: {dir_path}")
                    
    except Exception as e:
        logger.error(f"File cleanup error: {e}")
```

### Main.py Router Registration

**Update: `app/main.py`**

```python
# Include Routes
from app.routes import health, tts, auth, generations, images, videos

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(tts.router)
app.include_router(generations.router)
app.include_router(images.router)
app.include_router(videos.router)  # NEW
```

### Configuration

**Update: `app/config/settings.py`**

```python
# Add new settings
MAX_VIDEO_SIZE_MB: int = 500  # Max download size
VIDEO_DOWNLOAD_TIMEOUT_MINUTES: int = 30  # Max download time
SUPPORTED_VIDEO_PLATFORMS: list = ["youtube", "instagram"]
```

### New Dependencies

**Update: `requirements.txt`**

```
yt-dlp>=2023.12.30
```

### Database Migration

**Create Migration:**

```bash
alembic revision --autogenerate -m "Add video_downloads table"
```

This generates the schema creation SQL automatically.

### Status Flow Diagram

```
User Request
    ↓
┌─────────────────────┐
│ pending             │ (Initial state, just created)
└──────────┬──────────┘
           │
        async task starts
           ↓
┌─────────────────────┐
│ downloading         │ (yt-dlp fetching media)
└──────────┬──────────┘
           │
       success?
         ↙   ↘
        yes   no
        ↓     └─→ error_message = "..."
        ↓
┌─────────────────────┐
│ processing          │ (Converting, encoding)
└──────────┬──────────┘
           │
       success?
         ↙   ↘
        yes   no
        ↓     └─→ error_message = "..."
        ↓
┌─────────────────────┐
│ completed           │ (Ready for download)
│ file_path = "..."   │
│ file_size_bytes = ..│
└─────────────────────┘
```

---

## Safe Integration Checklist

✅ **Before Deploying New Feature:**

- [ ] Database migration tested (alembic upgrade head)
- [ ] New model added to User relationships
- [ ] Repository layer implements all CRUD operations
- [ ] Service layer handles business logic
- [ ] Routes validate input and check auth
- [ ] Error handling consistent with existing patterns
- [ ] File paths use fixed directories (no user input)
- [ ] Ownership checks on all user-specific operations
- [ ] Cleanup service includes new file types
- [ ] Logging in place for debugging
- [ ] Settings added to .env template
- [ ] All endpoints return consistent response format
- [ ] Database indexes created for query performance
- [ ] Tests cover happy path and error cases
- [ ] Configuration settings reasonable (timeouts, sizes)

✅ **Deployment:**

- [ ] Run alembic migrations first
- [ ] Set .env variables for new feature
- [ ] Restart app (lifespan runs, validates DB)
- [ ] Monitor logs for errors
- [ ] Test each endpoint with curl/Postman
- [ ] Check database records created correctly
- [ ] Verify file storage directories created
- [ ] Check cleanup service logs

---

## Summary

This FastAPI application is **production-ready** with:

- ✅ Async/await throughout
- ✅ JWT authentication
- ✅ Database with SQLAlchemy ORM
- ✅ Repository pattern for data access
- ✅ Structured error handling
- ✅ Comprehensive logging
- ✅ Background task processing
- ✅ Auto-cleanup of old files
- ✅ User data isolation
- ✅ Proper security measures

**New features can be safely added by following the established patterns:**

1. Create database model
2. Create repository for CRUD
3. Create service for business logic
4. Create routes for API endpoints
5. Update cleanup service if needed
6. Update main.py router registration
7. Create database migration
8. Add configuration settings
9. Test thoroughly

The recommended video downloader feature integrates seamlessly with these existing patterns.

---

## Appendix A: Quick Reference Commands

```bash
# Run application
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Database migrations
alembic upgrade head              # Apply migrations
alembic revision --autogenerate   # Create new migration
alembic downgrade -1              # Rollback one version

# Install dependencies
pip install -r requirements.txt

# Run tests
python run_tests.py

# View logs
tail -f logs/app.log
```

---

## Appendix B: Important Files Reference

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app entry point, router registration |
| `app/config/settings.py` | Configuration from .env |
| `app/auth/jwt.py` | Token creation/validation |
| `app/auth/dependencies.py` | FastAPI dependency functions |
| `app/db/session.py` | Database connection setup |
| `app/db/models/` | SQLAlchemy ORM models |
| `app/db/repositories/` | Data access layer |
| `app/routes/` | API endpoint handlers |
| `app/services/` | Business logic layer |
| `.env` | Environment variables (not committed) |

---

*Generated: 2026-05-25*
*For questions or updates, refer to specific section numbers.*
