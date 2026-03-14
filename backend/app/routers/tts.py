import logging
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel
from app.services.tts_service import generate_speech

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tts", tags=["tts"])


class TTSRequest(BaseModel):
    text: str
    persona: str


@router.post("/speak")
async def speak(request: TTSRequest):
    """Generate speech audio for a given persona and text."""
    logger.info(f"TTS request for persona: {request.persona}")
    audio = await generate_speech(request.text, request.persona)
    return Response(content=audio, media_type="audio/mpeg")
