import requests
import json

BASE_URL = "http://localhost:8000"

def test_health():
    print("Testing Health Endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(response.json())
    print("-" * 30)

def test_voices():
    print("Testing Voices Endpoint...")
    response = requests.get(f"{BASE_URL}/api/v1/tts/voices")
    print(f"Status: {response.status_code}")
    voices = response.json()
    print(f"Found {len(voices)} voices.")
    # Show a few voices
    for voice in voices[:3]:
        print(f"- {voice['ShortName']} ({voice['Locale']})")
    print("-" * 30)

def test_generate():
    print("Testing TTS Generation...")
    payload = {
        "text": "नमस्ते, आप कैसे हैं? This is a test of the Edge TTS service.",
        "voice": "hi-IN-MadhurNeural",
        "rate": "+0%",
        "pitch": "+0Hz"
    }
    response = requests.post(f"{BASE_URL}/api/v1/tts/generate", json=payload)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        with open("test_output.mp3", "wb") as f:
            f.write(response.content)
        print("Success! Saved output to 'test_output.mp3'")
    else:
        print(f"Error: {response.text}")
    print("-" * 30)

if __name__ == "__main__":
    try:
        test_health()
        test_voices()
        test_generate()
    except Exception as e:
        print(f"Failed to connect to service: {e}")
        print("Make sure the server is running on http://localhost:8000")
