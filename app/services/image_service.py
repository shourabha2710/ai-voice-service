import os
import uuid
import time
import torch
from pathlib import Path
from typing import Optional

from diffusers import AutoPipelineForText2Image
from PIL import Image
import logging

logger = logging.getLogger(__name__)


class ImageGenerationService:
    """
    DreamShaper XL Turbo Image Generation Service

    Optimized for:
    - Better realism
    - Better anatomy
    - Better cinematic quality
    - Faster CPU generation
    - GPU acceleration support
    """

    _instance: Optional["ImageGenerationService"] = None
    _pipeline: Optional[AutoPipelineForText2Image] = None
    _device: Optional[str] = None

    # DREAMSHAPER XL TURBO MODEL
    _model_name: str = "Lykon/dreamshaper-xl-turbo"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)

        return cls._instance

    @classmethod
    def get_instance(cls) -> "ImageGenerationService":
        if cls._instance is None:
            cls._instance = cls()

        return cls._instance

    @staticmethod
    def _detect_device() -> str:
        """
        Detect CUDA or CPU
        """

        if torch.cuda.is_available():
            logger.info("CUDA detected. Using GPU.")
            return "cuda"

        logger.info("CUDA not available. Using CPU.")
        return "cpu"

    async def initialize(self) -> None:
        """
        Initialize DreamShaper XL Turbo pipeline
        """

        if self._pipeline is not None:
            logger.info("Pipeline already initialized.")
            return

        try:
            self._device = self._detect_device()

            logger.info(
                f"Loading model: {self._model_name} "
                f"on device: {self._device}"
            )

            # CPU Optimization
            if self._device == "cpu":
                torch.set_num_threads(os.cpu_count())

            # LOAD DREAMSHAPER XL TURBO
            self._pipeline = AutoPipelineForText2Image.from_pretrained(
                self._model_name,
                torch_dtype=(
                    torch.float16
                    if self._device == "cuda"
                    else torch.float32
                ),
                variant="fp16" if self._device == "cuda" else None,
                use_safetensors=True,
            )

            # MOVE TO DEVICE
            self._pipeline = self._pipeline.to(self._device)

            # MEMORY OPTIMIZATION
            self._pipeline.enable_attention_slicing()

            # Additional optimization
            if self._device == "cuda":
                self._pipeline.enable_xformers_memory_efficient_attention()

            logger.info("DreamShaper XL Turbo loaded successfully.")

            logger.info(
                {
                    "device": self._device,
                    "cuda_available": torch.cuda.is_available(),
                    "model": self._model_name,
                    "cpu_threads": os.cpu_count(),
                }
            )

        except Exception as e:
            logger.exception(
                f"Failed to initialize image generation service: {e}"
            )
            raise

    async def generate_image(
        self,
        prompt: str,
        height: int = 1024,
        width: int = 1024,
        num_inference_steps: int = 6,
        guidance_scale: float = 2.0,
        seed: Optional[int] = None,
    ) -> tuple[Image.Image, float]:
        """
        Generate image using DreamShaper XL Turbo

        Recommended:
        - 4 to 8 steps
        - guidance 1.0 to 2.5
        """

        if self._pipeline is None:
            raise RuntimeError(
                "Pipeline not initialized. Call initialize() first."
            )

        try:
            logger.info(
                f"IMAGE_GENERATION_STARTED | "
                f"prompt='{prompt[:80]}'"
            )

            start_time = time.time()

            # SEED
            if seed is not None:
                generator = torch.Generator(
                    device=self._device
                ).manual_seed(seed)
            else:
                generator = torch.Generator(
                    device=self._device
                ).manual_seed(
                    int(time.time())
                )

            # NEGATIVE PROMPT
            negative_prompt = (
                "blurry, low quality, bad anatomy, "
                "extra fingers, extra hands, deformed face, "
                "cropped, worst quality, ugly, distorted, "
                "duplicate body, malformed eyes"
            )

            # GENERATE IMAGE
            with torch.no_grad():

                result = self._pipeline(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    height=height,
                    width=width,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    generator=generator,
                )

            image = result.images[0]

            generation_time = time.time() - start_time

            logger.info(
                f"IMAGE_GENERATION_COMPLETED | "
                f"time={generation_time:.2f}s"
            )

            return image, generation_time

        except Exception as e:
            logger.exception(
                f"IMAGE_GENERATION_FAILED | error={str(e)}"
            )
            raise

    def save_image(
        self,
        image: Image.Image,
        image_id: uuid.UUID,
    ) -> str:
        """
        Save generated image
        """

        storage_dir = Path("storage/generated-images")

        storage_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        filename = f"{image_id}.png"

        filepath = storage_dir / filename

        image.save(
            filepath,
            format="PNG",
            optimize=True,
        )

        logger.info(f"Image saved: {filepath}")

        return f"storage/generated-images/{filename}"

    def get_device_info(self) -> dict:
        """
        Device information
        """

        return {
            "device": self._device or "not_initialized",
            "cuda_available": torch.cuda.is_available(),
            "cuda_device_count": (
                torch.cuda.device_count()
                if torch.cuda.is_available()
                else 0
            ),
            "model_loaded": self._pipeline is not None,
            "model_name": self._model_name,
            "cpu_threads": os.cpu_count(),
        }

    def cleanup(self) -> None:
        """
        Cleanup memory
        """

        try:

            if self._device == "cuda":
                torch.cuda.empty_cache()

            logger.info("Image generation service cleaned up.")

        except Exception as e:
            logger.warning(f"Cleanup warning: {e}")


# SINGLETON INSTANCE
image_service = ImageGenerationService.get_instance()