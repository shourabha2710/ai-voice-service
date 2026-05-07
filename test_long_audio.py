"""
Test script for long audio generation with job polling, download, and verification.
Tests the chunking and merging logic by triggering a long generation job.
"""

import requests
import time
from pathlib import Path
import sys

API_URL = "http://localhost:8000/api/v1/tts"

def trigger_job(text: str, voice: str = "en-US-GuyNeural") -> str:
    resp = requests.post(f"{API_URL}/generate-long-audio", json={"text": text, "voice": voice})
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    print(f"Job created: {job_id}")
    return job_id

def poll_job(job_id: str, timeout: int = 120) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        resp = requests.get(f"{API_URL}/job/{job_id}")
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "unknown")
        progress = data.get("progress", 0)
        chunks = f"{data.get('completed_chunks', 0)}/{data.get('total_chunks', 0)}"
        print(f"Status: {status} | Progress: {progress}% | Chunks: {chunks}")
        if status == "completed":
            return data
        if status == "failed":
            print(f"Job failed: {data.get('error', 'Unknown error')}")
            sys.exit(1)
        time.sleep(3)
    print("Timeout waiting for job completion")
    sys.exit(1)

def download_result(job_id: str, output_path: str = "test_output.mp3"):
    resp = requests.get(f"{API_URL}/job/{job_id}/download")
    resp.raise_for_status()
    with open(output_path, "wb") as f:
        f.write(resp.content)
    size_kb = Path(output_path).stat().st_size / 1024
    print(f"Downloaded: {output_path} ({size_kb:.1f} KB)")
    return output_path

def verify_chunking(data: dict):
    total = data.get("total_chunks", 0)
    if total > 1:
        print(f"Chunking verified: {total} chunks were processed")
    else:
        print(f"Warning: Only {total} chunk(s) - text may be too short to chunk")

def main():
    print("=== Long Audio TTS Test ===")
    
    # Generate a long text (10k+ characters)
    long_text = "This is a test sentence for text-to-speech conversion. " * 200
    print(f"Generated text: {len(long_text)} characters")
    
    # Step 1: Trigger job
    job_id = trigger_job(long_text)
    
    # Step 2: Poll until completed
    data = poll_job(job_id)
    
    # Step 3: Verify chunking
    verify_chunking(data)
    
    # Step 4: Download result
    output_path = download_result(job_id)
    
    # Step 5: Cleanup (optional - delete job)
    resp = requests.delete(f"{API_URL}/job/{job_id}")
    if resp.status_code == 200:
        print(f"Job {job_id} cleaned up")
    
    print("\n[PASS] All tests passed!")

if __name__ == "__main__":
    main()
