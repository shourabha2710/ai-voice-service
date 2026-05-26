import uuid
import asyncio
import logging
import subprocess
import time
import os
from pathlib import Path
from typing import Optional

from PIL import Image

from app.config.settings import settings
from app.services.image_service import image_service

logger = logging.getLogger(__name__)


class VideoGenerationService:
    _instance: Optional["VideoGenerationService"] = None

    VIDEO_STORAGE = Path("storage/generated-videos")
    TEMP_FRAMES = Path("storage/temp-frames")

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def get_instance(cls) -> "VideoGenerationService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _ensure_dirs(self) -> None:
        self.VIDEO_STORAGE.mkdir(parents=True, exist_ok=True)
        self.TEMP_FRAMES.mkdir(parents=True, exist_ok=True)

    def _get_ffmpeg_path(self) -> str:
        path = settings.get_ffmpeg_path()
        if not path:
            raise RuntimeError("FFmpeg not found. Please install FFmpeg.")
        return path

    def _get_resolution(self, aspect_ratio: str, quality: str) -> tuple[int, int]:
        if aspect_ratio == "9:16":
            if quality == "high":
                return 720, 1280
            return 480, 854
        else:
            if quality == "high":
                return 1280, 720
            return 854, 480

    async def generate_video_frames(
        self,
        prompt: str,
        generation_id: uuid.UUID,
        count: int = 4,
    ) -> list[Path]:
        self._ensure_dirs()
        frame_paths = []
        for i in range(count):
            seed = int(time.time() * 1000) % (2**31)
            logger.info(f"Generating frame {i+1}/{count} for generation {generation_id}")
            image, _ = await image_service.generate_image(
                prompt=prompt,
                seed=seed,
            )
            frame_path = self.TEMP_FRAMES / f"{generation_id}_{i}.png"
            image.save(frame_path, format="PNG")
            frame_paths.append(frame_path)
            logger.info(f"Frame {i+1} saved: {frame_path}")
        return frame_paths

    async def render_video(
        self,
        frame_paths: list[Path],
        generation_id: uuid.UUID,
        duration: int,
        aspect_ratio: str,
        quality: str,
        progress_callback=None,
    ) -> Path:
        self._ensure_dirs()
        ffmpeg = self._get_ffmpeg_path()
        output_path = self.VIDEO_STORAGE / f"{generation_id}.mp4"

        width, height = self._get_resolution(aspect_ratio, quality)
        fps = 24
        frames_per_segment = int((duration / len(frame_paths)) * fps)
        fade_duration = int(fps * 0.5)

        filter_parts = []
        concat_inputs = []
        zoom_effects = ["1.3-0.1*(on-1)/fw", "1.2+0.1*(on-1)/fw", "1.0+0.15*(on-1)/fw", "1.4-0.2*(on-1)/fw"]

        for i, frame_path in enumerate(frame_paths):
            input_label = f"v{i}"
            zoom = zoom_effects[i % len(zoom_effects)]
            filter_parts.append(
                f"[{i}:v]"
                f"zoompan=z='if(lte(on,1),1.3,{zoom})':"
                f"d={frames_per_segment}:"
                f"fps={fps}:"
                f"s={width}x{height},"
                f"fade=t=in:st=0:d=0.5,"
                f"fade=t=out:st={duration/len(frame_paths)-0.5}:d=0.5"
                f"[{input_label}]"
            )
            concat_inputs.append(f"[{input_label}]")

        concat_str = f"{''.join(concat_inputs)}concat=n={len(frame_paths)}:v=1:a=0[out]"
        filter_complex = ";".join(filter_parts) + ";" + concat_str

        input_args = []
        for frame_path in frame_paths:
            input_args.extend(["-loop", "1", "-i", str(frame_path)])

        cmd = [
            ffmpeg, "-y",
            *input_args,
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-c:v", "libx264",
            "-preset", "medium",
            "-pix_fmt", "yuv420p",
            "-crf", "23" if quality == "standard" else "18",
            "-t", str(duration),
            "-movflags", "+faststart",
            str(output_path),
        ]

        logger.info(f"Running FFmpeg command for generation {generation_id}")
        logger.debug(f"FFmpeg command: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode("utf-8", errors="replace")[:1024]
            logger.error(f"FFmpeg failed for generation {generation_id}: {error_msg}")
            raise RuntimeError(f"FFmpeg encoding failed: {error_msg}")

        if not output_path.exists():
            raise RuntimeError(f"Output video not found: {output_path}")

        logger.info(f"Video rendered successfully: {output_path}")
        return output_path

    def generate_thumbnail(self, generation_id: uuid.UUID) -> Path:
        self._ensure_dirs()
        video_path = self.VIDEO_STORAGE / f"{generation_id}.mp4"
        thumbnail_path = self.VIDEO_STORAGE / f"{generation_id}_thumb.jpg"
        ffmpeg = self._get_ffmpeg_path()

        cmd = [
            ffmpeg, "-y",
            "-i", str(video_path),
            "-vframes", "1",
            "-q:v", "2",
            str(thumbnail_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"Thumbnail generation failed: {result.stderr[:500]}")
            raise RuntimeError(f"Thumbnail generation failed: {result.stderr[:500]}")

        logger.info(f"Thumbnail generated: {thumbnail_path}")
        return thumbnail_path

    def cleanup_temp_frames(self, generation_id: uuid.UUID) -> None:
        for f in self.TEMP_FRAMES.glob(f"{generation_id}_*.png"):
            try:
                f.unlink()
                logger.debug(f"Deleted temp frame: {f}")
            except Exception as e:
                logger.warning(f"Failed to delete temp frame {f}: {e}")

    def cleanup_generated_files(self, generation_id: uuid.UUID) -> None:
        for pattern in [f"{generation_id}.mp4", f"{generation_id}_thumb.jpg"]:
            path = self.VIDEO_STORAGE / pattern
            try:
                if path.exists():
                    path.unlink()
                    logger.info(f"Deleted: {path}")
            except Exception as e:
                logger.warning(f"Failed to delete {path}: {e}")
        self.cleanup_temp_frames(generation_id)


video_generation_service = VideoGenerationService.get_instance()
