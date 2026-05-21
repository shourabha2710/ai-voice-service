from diffusers import StableDiffusionPipeline
import torch
import time

# Lightweight Stable Diffusion model
model_id = "runwayml/stable-diffusion-v1-5"

print("Loading AI model...")
start_time = time.time()

pipe = StableDiffusionPipeline.from_pretrained(
    model_id,
    torch_dtype=torch.float32,
    safety_checker=None
)

# CPU mode
pipe = pipe.to("cpu")

# Memory optimization for CPU
pipe.enable_attention_slicing()

print(f"Model loaded in {round(time.time() - start_time, 2)} sec")

# Your prompt
prompt = "A futuristic cyberpunk city at night with neon lights, ultra realistic, cinematic"

print("Generating image... Please wait...")

gen_start = time.time()

image = pipe(
    prompt,
    num_inference_steps=20,
    guidance_scale=7.5
).images[0]

# Save image
image.save("output.png")

print(f"Image generated in {round(time.time() - gen_start, 2)} sec")
print("Done! Image saved as output.png")
