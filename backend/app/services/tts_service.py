import logging
import edge_tts

logger = logging.getLogger(__name__)

PERSONA_VOICES = {
    "genius": "en-US-GuyNeural",
    "confused": "en-US-JennyNeural",
    "skeptic": "en-US-ChristopherNeural",
    "summarizer": "en-US-AriaNeural",
    "quiz_master": "en-US-SteffanNeural",
    "organizer": "en-US-SaraNeural",
}


async def generate_speech(text: str, persona: str) -> bytes:
    """Generate speech audio for a persona's response using Edge TTS."""
    voice = PERSONA_VOICES.get(persona, "en-US-GuyNeural")
    logger.info(f"Generating TTS for [{persona}] with voice {voice} ({len(text)} chars)")

    for attempt in range(2):
        try:
            communicate = edge_tts.Communicate(text, voice)
            audio_data = b""

            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]

            if audio_data:
                logger.info(f"TTS generated: {len(audio_data)} bytes")
                return audio_data
            else:
                logger.warning(f"TTS returned empty audio (attempt {attempt + 1})")
        except Exception as e:
            logger.warning(f"TTS attempt {attempt + 1} failed: {e}")

    # Return minimal valid MP3 silence (avoids 500 errors — frontend detects short audio)
    logger.warning("TTS failed after retries, returning silence")
    return b""
