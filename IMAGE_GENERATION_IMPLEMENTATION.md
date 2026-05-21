# Text-to-Image Generation Feature - Implementation Guide

## Overview

This implementation adds complete text-to-image generation capabilities to the VoxForge AI SaaS platform using Stable Diffusion models. The feature is fully integrated with the existing JWT authentication, PostgreSQL backend, and React frontend.

## Architecture

### Clean Separation
- **Audio Generation**: `app/services/generation_service.py`, `app/routes/tts.py`
- **Image Generation**: `app/services/image_service.py`, `app/routes/images.py`
- **Shared**: Database, Auth, Repositories pattern

### Key Design Principles
1. **Singleton Pattern**: Model loads once on startup, reused for all requests
2. **Background Processing**: Async task generation prevents API timeouts
3. **User Isolation**: All queries enforce `user_id` server-side
4. **Safe File Serving**: Images served through authenticated endpoints only
5. **GPU/CPU Auto-detection**: Optimized for available hardware

---

## Database Schema

### Table: `image_generations`

```sql
CREATE TABLE image_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt VARCHAR(2048) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    image_path VARCHAR(1024),
    provider VARCHAR(100) NOT NULL DEFAULT 'stable-diffusion-v1-5',
    generation_time_seconds FLOAT,
    error_message VARCHAR(1024),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX ix_image_generations_user_id ON image_generations(user_id);
CREATE INDEX ix_image_generations_created_at ON image_generations(created_at);
CREATE INDEX ix_image_generations_user_id_created_at ON image_generations(user_id, created_at);
CREATE INDEX ix_image_generations_status ON image_generations(status);
```

### Status Flow
```
pending → processing → completed
                    ↘ failed
```

---

## Backend API Endpoints

### Authentication
- All endpoints require JWT Bearer token
- Invalid/expired tokens return 401
- User ID is extracted from token, NEVER from request body

### Endpoints

#### 1. Generate Image
```
POST /api/v1/images/generate
Authorization: Bearer {token}
Content-Type: application/json

{
  "prompt": "A serene mountain landscape with golden sunlight"
}

Response (202 Accepted):
{
  "id": "uuid",
  "user_id": "uuid",
  "prompt": "A serene mountain landscape...",
  "status": "pending",
  "image_path": null,
  "provider": "stable-diffusion-v1-5",
  "generation_time_seconds": null,
  "error_message": null,
  "created_at": "2026-05-21T12:00:00Z",
  "completed_at": null
}
```

- Returns immediately (202 Accepted)
- Image generation happens in background
- Client polls `/api/v1/images/{id}` for updates

#### 2. Get Image History
```
GET /api/v1/images/history?skip=0&limit=20&status_filter=completed
Authorization: Bearer {token}

Response (200 OK):
{
  "items": [...],
  "total": 42,
  "page": 0,
  "page_size": 20
}
```

- Returns paginated history (newest first)
- Optional `status_filter`: "pending", "processing", "completed", "failed"
- Only returns images created by authenticated user

#### 3. Get Image Details
```
GET /api/v1/images/{id}
Authorization: Bearer {token}

Response (200 OK):
{
  "id": "uuid",
  "user_id": "uuid",
  "prompt": "...",
  "status": "completed",
  "image_path": "storage/generated-images/{uuid}.png",
  "image_url": "/api/v1/images/{id}/file",
  "generation_time_seconds": 15.4,
  "error_message": null,
  "created_at": "...",
  "completed_at": "..."
}
```

- 404 if image doesn't exist or doesn't belong to user

#### 4. Download Image File
```
GET /api/v1/images/{id}/file
Authorization: Bearer {token}

Response: PNG image file (image/png)
```

- Returns actual image file
- 404 if image not found or generation incomplete
- Filename: `generated-image-{id}.png`

#### 5. Delete Image
```
DELETE /api/v1/images/{id}
Authorization: Bearer {token}

Response (204 No Content)
```

- Deletes record only (file cleanup handled separately if needed)
- Only owner can delete

---

## Backend Implementation Details

### Image Service (`app/services/image_service.py`)

#### Initialization
```python
# On app startup
await image_service.initialize()
```

- Loads model once from HuggingFace
- Auto-detects CUDA availability
- Uses FP16 for GPU, FP32 for CPU
- Enables attention slicing for memory optimization

#### Generation
```python
image, generation_time = await image_service.generate_image(
    prompt="A futuristic city",
    height=512,
    width=512,
    num_inference_steps=50,
    guidance_scale=7.5,
    seed=None  # Optional for reproducibility
)
```

#### Device Detection
```python
device = "cuda" if torch.cuda.is_available() else "cpu"
```

#### Optimization
- **GPU**: FP16 dtype, attention slicing
- **CPU**: FP32 dtype, default settings
- Memory cleanup: `torch.cuda.empty_cache()` if CUDA

### Background Processing

Image generation happens in a background task:

1. HTTP request returns immediately (202)
2. Database record created with status="pending"
3. BackgroundTasks schedules `_generate_image_background`
4. Background task:
   - Loads/initializes model
   - Generates image
   - Saves to `storage/generated-images/{id}.png`
   - Updates database with completion
5. Client polls for updates

### Security

#### Authorization
```python
# Every endpoint checks authentication
@router.get("/{generation_id}")
async def get_image_detail(
    generation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),  # JWT validation
    db: AsyncSession = Depends(get_db),
):
    # Query enforces user_id
    generation = await repo.get_by_id_and_user(
        generation_id, 
        current_user.id  # Server-side validation
    )
```

#### File Serving
```python
# Only authenticated users can access their own images
# Path validation prevents directory traversal
file_path = Path(generation.image_path)
if not file_path.parts[0] == "storage" or not file_path.parts[1] == "generated-images":
    raise HTTPException(403, "Access denied")
```

---

## Frontend Architecture

### State Management (`useImageJobsStore`)

Zustand store with:
- Automatic deduplication: `dedupeImages()`
- Polling: `startPolling()` / `stopPolling()`
- Sync with backend: `syncWithBackend()`
- Local optimistic updates

#### Features
- Prevents duplicate images in state
- Auto-polls for pending/processing jobs
- Syncs every 3 seconds
- Stops when no pending jobs

### Components

#### `ImageGeneratorPage.tsx`
- Main page component
- Auth-protected
- Combines prompt box + history

#### `ImagePromptBox.tsx`
- Text input with 2048 char limit
- Quick suggestion buttons
- Loading states
- Keyboard shortcuts (Ctrl+Enter)

#### `ImageHistory.tsx`
- Paginated gallery
- Stats display
- Deduplication
- Auto-refresh on delete

#### `ImageCard.tsx`
- Individual image display
- Status badge with icon
- Download/Delete buttons
- Hover preview
- Error display

### API Client (`frontend/src/lib/api.ts`)

```typescript
export const generateImage = async (data: ImageGenerationRequest): Promise<ImageGeneration>
export const getImageHistory = async (skip?: number, limit?: number, status?: string)
export const getImageDetail = async (imageId: string): Promise<ImageGeneration>
export const downloadImage = async (imageId: string): Promise<Blob>
export const deleteImage = async (imageId: string): Promise<void>
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
# Backend - from project root
pip install -r requirements.txt

# Frontend - from frontend directory
npm install
```

### 2. Database Migration

Add migration for `image_generations` table:

```bash
# From project root
alembic revision --autogenerate -m "Add image_generations table"
alembic upgrade head
```

Or run SQL directly (for development):

```sql
CREATE TABLE IF NOT EXISTS image_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt VARCHAR(2048) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    image_path VARCHAR(1024),
    provider VARCHAR(100) NOT NULL DEFAULT 'stable-diffusion-v1-5',
    generation_time_seconds FLOAT,
    error_message VARCHAR(1024),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ix_image_generations_user_id ON image_generations(user_id);
CREATE INDEX ix_image_generations_created_at ON image_generations(created_at);
CREATE INDEX ix_image_generations_user_id_created_at ON image_generations(user_id, created_at);
CREATE INDEX ix_image_generations_status ON image_generations(status);
```

### 3. Create Storage Directory

```bash
mkdir -p storage/generated-images
chmod 755 storage/generated-images
```

### 4. Download Model (First Time)

The model (~4GB) downloads automatically on first run:
```
runwayml/stable-diffusion-v1-5
```

Expect 2-5 minute startup on first launch.

### 5. Run Services

```bash
# Terminal 1: Backend
cd /path/to/python-tts-service
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev

# Access at http://localhost:5174/images
```

---

## Testing Checklist

### Security Tests

#### TEST 1: Unauthenticated Access Blocked
```bash
# Should return 401
curl -X GET http://localhost:8000/api/v1/images/history

# Should return 403
curl -X POST http://localhost:8000/api/v1/images/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}'
```

#### TEST 2: User Isolation
- User A generates image
- User B tries to access User A's image
- Should return 404

```bash
# Simulate with different tokens
curl -X GET http://localhost:8000/api/v1/images/{user_a_image_id} \
  -H "Authorization: Bearer {user_b_token}"
# Should return 404
```

#### TEST 3: Inactive User Blocked
- Deactivate user in database: `UPDATE users SET is_active=false WHERE id='...'`
- Try to generate image
- Should return 403

### Functional Tests

#### TEST 4: Generate Image Successfully
1. Navigate to http://localhost:5174/images
2. Enter prompt: "A beautiful sunset over the ocean"
3. Click "Generate Image"
4. Verify:
   - Card appears with "Generating..." status
   - Spinner visible
   - History updates
   - After 30-60s: Image appears

#### TEST 5: History Persists After Refresh
1. Generate an image
2. Refresh page (F5)
3. History should reload from backend
4. Previously completed images visible

#### TEST 6: Download Image
1. Wait for image to complete
2. Click Download button
3. File should save as `generated-image-{uuid}.png`

#### TEST 7: Delete Image
1. Generate image
2. Click Delete button
3. Confirm deletion
4. Image removed from gallery
5. Refresh page - still gone (deleted from DB)

#### TEST 8: Status Polling
1. Generate image
2. Watch browser Network tab
3. Requests to `/api/v1/images/{id}` every 3 seconds
4. Stop polling when status != pending/processing

---

## Performance Characteristics

### Generation Time (estimate)
- **GPU (NVIDIA 3080)**: 15-30 seconds
- **GPU (RTX 2080)**: 30-60 seconds  
- **CPU (i7-9700k)**: 3-5 minutes
- **CPU (M1 Mac)**: 1-2 minutes

### Memory Usage
- **GPU (FP16)**: ~3-4 GB
- **CPU (FP32)**: ~5-8 GB

### Model Size
- `runwayml/stable-diffusion-v1-5`: ~3.97 GB

### Concurrent Requests
- Single GPU: Sequential (model locked during generation)
- Multiple CPUs: Can run in parallel
- Consider queue for production

---

## Production Recommendations

### 1. Model Caching
```python
# Current: Loads runwayml/stable-diffusion-v1-5
# Production: Cache locally

cache_dir = "/var/cache/models"
model = StableDiffusionPipeline.from_pretrained(
    model_id,
    cache_dir=cache_dir
)
```

### 2. Queue System
For high traffic, use Celery/RQ:
```python
@celery.task
async def generate_image_task(generation_id):
    # Background job with retry, timeout
    pass
```

### 3. Prompt Validation
Add content filtering:
```python
from better_profanity import profanity
if profanity.contains(prompt):
    raise HTTPException(400, "Inappropriate content")
```

### 4. Rate Limiting
```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.post("/generate")
@limiter.limit("5/minute")
async def generate_image(request: Request, ...):
    pass
```

### 5. CDN / S3 Storage
Move from local storage to S3:
```python
import boto3
s3_client = boto3.client('s3')
s3_client.put_object(
    Bucket='voxforge-images',
    Key=f'images/{generation_id}.png',
    Body=image_bytes
)
image_url = s3_client.generate_presigned_url(...)
```

### 6. Model Selection
Support multiple models:
```python
AVAILABLE_MODELS = {
    "stable-diffusion-v1-5": "runwayml/stable-diffusion-v1-5",
    "stable-diffusion-xl": "stabilityai/stable-diffusion-xl-base-1.0",
    "deliberate-v2": "jbilcke-hf/deliberate-v2",
}
```

### 7. Monitoring
```python
from prometheus_client import Counter, Histogram

generation_counter = Counter('generations_total', 'Total generations')
generation_time_histogram = Histogram(
    'generation_duration_seconds',
    'Generation time in seconds'
)
```

---

## Future Enhancements

1. **Image Inpainting**: Edit existing images
2. **Style Transfer**: Apply styles to existing images
3. **Multi-model Support**: Let users choose model
4. **Upscaling**: 4x resolution via ESRGAN
5. **Image Variations**: Generate variations of existing images
6. **ControlNet**: Precise control with sketches/poses
7. **Batch Generation**: Generate multiple variations
8. **Image History Versioning**: Keep generation history
9. **Favorite/Collection**: Organize favorite images
10. **Public Gallery**: Share images with community

---

## Troubleshooting

### "Model not found" error
```
Solution: First run downloads ~4GB model
- Requires internet connection
- Takes 2-5 minutes
- Subsequent runs load from cache (~1 second)
```

### CUDA out of memory
```
Solution 1: Enable CPU fallback
Solution 2: Reduce resolution (height/width)
Solution 3: Reduce inference steps
Solution 4: Use FP16 (already enabled for GPU)
```

### Image not serving (404)
```
Solution: Check:
1. File exists: ls storage/generated-images/
2. Path in DB: SELECT image_path FROM image_generations WHERE id='{uuid}'
3. Permissions: chmod 644 storage/generated-images/*
```

### Polling not stopping
```
Solution: Check browser console for errors
- Ensure status updates correctly
- Verify auth token valid
- Check rate limiting not triggered
```

---

## Files Created/Modified

### Backend
- ✅ `app/db/models/image.py` - ORM Model
- ✅ `app/db/repositories/image.py` - Database Repository
- ✅ `app/schemas/image.py` - Pydantic Schemas
- ✅ `app/services/image_service.py` - Image Generation Service
- ✅ `app/routes/images.py` - API Endpoints
- ✅ `app/main.py` - Router registration + initialization
- ✅ `requirements.txt` - Dependencies (torch, diffusers, etc.)

### Frontend
- ✅ `frontend/src/pages/ImageGeneratorPage.tsx` - Main page
- ✅ `frontend/src/components/ImagePromptBox.tsx` - Prompt input
- ✅ `frontend/src/components/ImageHistory.tsx` - Gallery view
- ✅ `frontend/src/components/ImageCard.tsx` - Individual image
- ✅ `frontend/src/store/useImageJobsStore.ts` - State management
- ✅ `frontend/src/lib/api.ts` - API client functions
- ✅ `frontend/src/App.tsx` - Router integration
- ✅ `frontend/src/components/Navbar.tsx` - Navigation link

### Database
- Storage: `storage/generated-images/`
- Table: `image_generations`

---

## Conclusion

This implementation provides a production-ready, fully-featured text-to-image generation system integrated seamlessly with your existing SaaS platform. The clean architecture keeps audio and image generation separate while sharing auth, database, and repository patterns.

Key achievements:
✅ Full auth integration with user isolation
✅ Async background processing
✅ GPU/CPU auto-optimization
✅ Clean separation of concerns
✅ Comprehensive error handling
✅ Modern React UI with state management
✅ Security best practices throughout

The system is ready for testing and can scale through the recommended production enhancements.
