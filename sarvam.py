"""
Sarvam AI voice layer — speech-to-text (Saaras v3) and text-to-speech (Bulbul v3).

Both functions return None (never raise) when the API key is missing or the
call fails, so the caller can hide the relevant UI control instead of showing
something broken. is_voice_available() is what the frontend checks before
rendering the mic/listen buttons at all.
"""
import os
import base64
import requests

SARVAM_BASE = "https://api.sarvam.ai"


def is_voice_available():
    return bool(os.environ.get("SARVAM_API_KEY"))


def transcribe_audio(file_bytes: bytes, filename: str = "audio.wav"):
    """Returns transcribed text, or None if unavailable/failed."""
    api_key = os.environ.get("SARVAM_API_KEY")
    if not api_key:
        return None
    content_type = "audio/webm" if filename.endswith(".webm") else "audio/wav"
    try:
        resp = requests.post(
            f"{SARVAM_BASE}/speech-to-text",
            headers={"api-subscription-key": api_key},
            data={"model": "saaras:v3", "language_code": "unknown", "mode": "transcribe"},
            files={"file": (filename, file_bytes, content_type)},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("transcript")
    except Exception:
        return None


def synthesize_speech(text: str, language_code: str = "hi-IN", speaker: str = "shubh"):
    """Returns raw WAV audio bytes, or None if unavailable/failed."""
    api_key = os.environ.get("SARVAM_API_KEY")
    if not api_key:
        return None
    try:
        resp = requests.post(
            f"{SARVAM_BASE}/text-to-speech",
            headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text[:2500],
                "model": "bulbul:v3",
                "speaker": speaker,
                "language_code": language_code,
            },
            timeout=10,
        )
        resp.raise_for_status()
        audios = resp.json().get("audios", [])
        if not audios:
            return None
        return base64.b64decode(audios[0])
    except Exception:
        return None


if __name__ == "__main__":
    print("voice available:", is_voice_available())
    print("transcribe (no key expected):", transcribe_audio(b"fake", "test.wav"))
    print("speak (no key expected):", synthesize_speech("test"))
