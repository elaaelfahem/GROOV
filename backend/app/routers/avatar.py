import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/avatar", tags=["avatar"])

class StreamRequest(BaseModel):
    source_url: str

@router.post("/stream")
async def create_stream(request: StreamRequest):
    """Proxy to create a D-ID Talk Stream."""
    if settings.did_api_key == "your_did_api_key_here":
        raise HTTPException(status_code=400, detail="D-ID API Key not configured")

    async with httpx.AsyncClient() as client:
        # D-ID expects the key to be used as is if it's already encoded, 
        # but usually it's id:secret. We'll pass it as provided.
        headers = {
            "Authorization": f"Basic {settings.did_api_key}",
            "Content-Type": "application/json"
        }
        response = await client.post(
            "https://api.d-id.com/talks/streams",
            json={"source_url": request.source_url},
            headers=headers
        )
        if response.status_code != 200:
            logger.error(f"D-ID Error: {response.text}")
        return response.json()

@router.post("/ice")
async def add_ice_candidate(stream_id: str, payload: dict):
    """Proxy to add ICE candidate to D-ID stream."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.d-id.com/talks/streams/{stream_id}/ice",
            json=payload,
            headers={"Authorization": f"Basic {settings.did_api_key}"}
        )
        return response.json()

@router.post("/offer")
async def start_stream(stream_id: str, payload: dict):
    """Proxy to start the session with an SDP offer."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.d-id.com/talks/streams/{stream_id}",
            json=payload,
            headers={"Authorization": f"Basic {settings.did_api_key}"}
        )
        return response.json()

@router.post("/talk")
async def request_talk(stream_id: str, payload: dict):
    """Proxy to request the avatar to start talking (lip-sync)."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.d-id.com/talks/streams/{stream_id}",
            json=payload,
            headers={
                "Authorization": f"Basic {settings.did_api_key}",
                "Content-Type": "application/json"
            }
        )
        if response.status_code not in (200, 201):
            logger.error(f"D-ID Talk Error: {response.text}")
        return response.json()
