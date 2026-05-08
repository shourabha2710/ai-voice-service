#!/usr/bin/env python3
"""
Simple test runner for the TTS service.
Run this after starting the service with: python -m app.main
"""
import subprocess
import sys
import time
import requests
import os

BASE_URL = "http://localhost:8000"


def test_health():
    """Test the health endpoint."""
    print("Testing /health endpoint...")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        if resp.status_code == 200:
            print(f"  PASSED: {resp.json()}")
            return True
        else:
            print(f"  FAILED: Status {resp.status_code}")
            return False
    except Exception as e:
        print(f"  FAILED: {e}")
        return False


def test_voices():
    """Test the voices endpoint."""
    print("Testing /api/v1/tts/voices endpoint...")
    try:
        resp = requests.get(f"{BASE_URL}/api/v1/tts/voices", timeout=10)
        if resp.status_code == 200:
            voices = resp.json()
            print(f"  PASSED: Found {len(voices)} voices")
            return True
        else:
            print(f"  FAILED: Status {resp.status_code}")
            return False
    except Exception as e:
        print(f"  FAILED: {e}")
        return False


def test_short_tts():
    """Test short text-to-speech generation."""
    print("Testing /api/v1/tts/generate endpoint (short text)...")
    try:
        payload = {
            "text": "Hello, this is a test of the Edge TTS service.",
            "voice": "en-US-GuyNeural"
        }
        resp = requests.post(f"{BASE_URL}/api/v1/tts/generate", json=payload, timeout=30)
        if resp.status_code == 200:
            print(f"  PASSED: Generated audio ({len(resp.content)} bytes)")
            return True
        else:
            print(f"  FAILED: Status {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"  FAILED: {e}")
        return False


def test_long_tts_job():
    """Test long audio generation job."""
    print("Testing /api/v1/tts/generate-long-audio endpoint...")
    try:
        long_text = "This is a test. " * 500  # ~7500 characters
        payload = {
            "text": long_text,
            "voice": "en-US-GuyNeural"
        }
        resp = requests.post(f"{BASE_URL}/api/v1/tts/generate-long-audio", json=payload, timeout=10)
        if resp.status_code != 200:
            print(f"  FAILED: Status {resp.status_code} - {resp.text}")
            return False

        result = resp.json()
        job_id = result.get("job_id")
        print(f"  Job created: {job_id}")

        # Poll for completion
        for _ in range(60):  # Wait up to 5 minutes
            time.sleep(5)
            status_resp = requests.get(f"{BASE_URL}/api/v1/tts/job/{job_id}", timeout=5)
            if status_resp.status_code == 200:
                job = status_resp.json()
                status = job.get("status")
                progress = job.get("progress", 0)
                print(f"  Status: {status} ({progress}%)")
                if status == "completed":
                    print(f"  PASSED: Job completed successfully")
                    # Try to download
                    dl_resp = requests.get(f"{BASE_URL}/api/v1/tts/job/{job_id}/download", timeout=10)
                    if dl_resp.status_code == 200:
                        print(f"  Download: PASSED ({len(dl_resp.content)} bytes)")
                    # Cleanup
                    requests.delete(f"{BASE_URL}/api/v1/tts/job/{job_id}")
                    return True
                elif status == "failed":
                    print(f"  FAILED: Job failed - {job.get('error')}")
                    return False
            else:
                print(f"  FAILED: Status check failed - {status_resp.status_code}")
                return False

        print("  FAILED: Job timed out")
        return False
    except Exception as e:
        print(f"  FAILED: {e}")
        return False


def wait_for_service():
    """Wait for the service to be ready."""
    print("Waiting for service to be ready...")
    for _ in range(30):
        try:
            resp = requests.get(f"{BASE_URL}/health", timeout=2)
            if resp.status_code == 200:
                print("  Service is ready!")
                return True
        except:
            pass
        time.sleep(1)
    print("  ERROR: Service not available")
    return False


if __name__ == "__main__":
    print("=" * 60)
    print("TTS Service Test Runner")
    print("=" * 60)

    if not wait_for_service():
        print("\nPlease start the service first with: python -m app.main")
        sys.exit(1)

    results = []

    results.append(("Health Check", test_health()))
    results.append(("Voices List", test_voices()))
    results.append(("Short TTS", test_short_tts()))
    results.append(("Long TTS Job", test_long_tts_job()))

    print("\n" + "=" * 60)
    print("Test Results:")
    print("=" * 60)
    for name, passed in results:
        status = "PASSED" if passed else "FAILED"
        print(f"  {name}: {status}")
    print()
