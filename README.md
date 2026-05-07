# Edge TTS Service

A production-ready Python Text-to-Speech (TTS) service using **FastAPI** and **edge-tts**. This service leverages Microsoft Edge's neural voices to provide high-quality speech synthesis without requiring an API key.

## Features

- ✅ **High Quality**: Uses Edge Neural voices.
- ✅ **Async Implementation**: Built with FastAPI and async/await.
- ✅ **Multi-Language**: Supports Hindi, English, and 100+ other languages.
- ✅ **Long Audio Support**: Automatic text chunking and parallel generation for large scripts (up to 50,000 characters).
- ✅ **Background Processing**: UUID-based job tracking for long-running tasks.
- ✅ **Audio Merging**: Seamlessly combines chunks into a single high-quality MP3 using FFmpeg.
- ✅ **Auto-Cleanup**: Automatically deletes old audio files and expired jobs.
- ✅ **Swagger UI**: Interactive API documentation at `/docs`.
- ✅ **FFmpeg Validation**: Startup check ensures FFmpeg is available for audio processing.

## Tech Stack

- **Python 3.9+**
- **FastAPI**: Web framework.
- **edge-tts**: TTS engine.
- **pydub**: Audio processing and merging.
- **FFmpeg**: Required for audio merging.
- **Loguru**: Structured logging.
- **Pydantic**: Data validation.
- **Uvicorn**: ASGI server.

---

## 🚀 Quick Start

### 1. Prerequisites

- **Python 3.9+**
- **FFmpeg**: Must be installed on your system (required for audio merging).
  - Windows: `choco install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/download.html)
  - Linux: `sudo apt install ffmpeg`
  - macOS: `brew install ffmpeg`
  
**Note**: The application will check for FFmpeg on startup and log a warning if not found. In production mode, missing FFmpeg will prevent the service from starting.

### 2. Local Setup

```bash
# Clone the repository (or copy the files)
cd python-tts-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the service
python -m app.main
```

The service will be available at `http://localhost:8000`.

---

## 🛠 API Endpoints

Base URL: `http://localhost:8000`

### 1. Short TTS (Synchronous)
**POST** `/api/tts/`
- Best for small snippets (up to 5000 characters).
- Returns the MP3 file directly.

**Example:**
```bash
curl -X POST "http://localhost:8000/api/tts/" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "voice": "en-US-JennyNeural"}' \
  --output speech.mp3
```

### 2. Long TTS (Background Job)
**POST** `/api/tts/long`
- Handles large scripts (up to 50,000 characters).
- Returns a `job_id` for tracking.

**GET** `/api/tts/job/{job_id}`
- Poll status, percentage, and progress of a background task.
- Status values: `pending`, `processing`, `completed`, `failed`

**GET** `/api/tts/job/{job_id}/download`
- Get final MP3 once status is `completed`.

**DELETE** `/api/tts/job/{job_id}`
- Manual cleanup of job and associated files.

**Example Workflow:**
```bash
# 1. Start long audio generation (background task)
curl -X POST "http://localhost:8000/api/tts/long" \
  -H "Content-Type: application/json" \
  -d '{"text": "Your long text here...", "voice": "en-US-JennyNeural"}'
# Returns: {"job_id": "abc-123", "message": "Long audio generation started in background."}

# 2. Poll job status
curl "http://localhost:8000/api/tts/job/abc-123"
# Returns: {"job_id": "abc-123", "status": "processing", "progress": 45, ...}

# 3. Download when completed
curl "http://localhost:8000/api/tts/job/abc-123/download" --output result.mp3

# 4. Cleanup
curl -X DELETE "http://localhost:8000/api/tts/job/abc-123"
```

### 2. Long TTS (Background Job)
**POST** `/api/tts/generate-long-audio`
- Handles large scripts (up to 50,000 characters).
- Returns a `job_id` for tracking.

**GET** `/api/tts/job/{job_id}`
- Poll this endpoint to track progress, percentage, and status.
- Status values: `pending`, `processing`, `completed`, `failed`

**GET** `/api/tts/job/{job_id}/download`
- Download the final merged MP3 once status is `completed`.

**DELETE** `/api/tts/job/{job_id}`
- Manually cleanup job and associated audio files.

**Example Workflow:**
```bash
# 1. Start long audio generation
curl -X POST "http://localhost:8000/api/tts/generate-long-audio" \
  -H "Content-Type: application/json" \
  -d '{"text": "Your long text here...", "voice": "en-US-JennyNeural"}'
# Returns: {"job_id": "abc-123", "message": "Long audio generation started in background."}

# 2. Poll job status
curl "http://localhost:8000/api/tts/job/abc-123"
# Returns: {"job_id": "abc-123", "status": "processing", "progress": 45, ...}

# 3. Download when completed
curl "http://localhost:8000/api/tts/job/abc-123/download" --output result.mp3

# 4. Cleanup
curl -X DELETE "http://localhost:8000/api/tts/job/abc-123"
```

### 3. Utilities
- **GET** `/api/tts/voices`: List all available neural voices (~400+ voices).
- **GET** `/health`: Health check endpoint.

### FFmpeg Requirement
⚠️ **FFmpeg is required** for audio chunk merging. The application will:
- Check for FFmpeg on startup
- Fail in production mode if FFmpeg is missing
- Log a warning in debug mode but continue running (long audio generation will fail)

---

## 📁 Project Structure

```
app/
 ├── main.py              # Entry point & Middleware
 ├── routes/              # API Route definitions
 │   ├── tts.py           # TTS generation endpoints
 │   └── health.py        # Health check endpoint
 ├── services/            # Business logic (TTS, Jobs, Cleanup)
 │   ├── tts_service.py   # Synchronous and long audio TTS
 │   ├── job_service.py   # Job tracking and management
 │   └── cleanup_service.py # Background cleanup tasks
 ├── models/              # Pydantic schemas
 │   ├── schemas.py       # Request/Response models
 │   └── jobs.py          # Job-related models
 ├── utils/               # Text chunking, Audio merging, Logging
 │   ├── text_chunker.py  # Split text into chunks
 │   ├── audio_merger.py  # Merge MP3 chunks using FFmpeg
 │   └── logger.py        # Loguru logging setup
 ├── config/              # Settings & Env vars
 │   └── settings.py      # Application configuration
 ├── logs/                # App logs
 ├── generated_audio/     # Final MP3 files
 └── temp_chunks/         # Temporary MP3 chunks (auto-cleaned)
```

---

## 🚢 Deployment

### Docker (Recommended)
The provided `Dockerfile` includes `ffmpeg` and is ready for production.

```bash
docker build -t edge-tts-service .
docker run -p 8000:8000 edge-tts-service
```

---

## 🧪 Testing

### Automated Tests
Run the test script to verify long audio generation:

```bash
# Start the service first
python -m app.main

# In another terminal, run the test
python test_long_audio.py
```

The test script will:
1. Trigger a long generation job (10k+ characters)
2. Poll status until completed
3. Download the result
4. Verify chunking and merging logic
5. Check temp file cleanup

### Manual Verification
- Test with 10k+ character script
- Check logs for parallel generation and merge stages
- Verify temp file cleanup
- Check Swagger UI at `/docs` for API documentation

---

## 📜 License
MIT
