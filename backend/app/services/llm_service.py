import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


class LLMServiceError(Exception):
    """Raised when the LLM service is unavailable or returns an error."""
    pass


async def call_ollama(prompt: str, retries: int = 2) -> str:
    """Call Ollama with retry logic and proper error handling."""
    last_error = None

    for attempt in range(retries + 1):
        try:
            logger.info(f"Calling Ollama (attempt {attempt + 1}/{retries + 1})...")
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    settings.ollama_url,
                    json={
                        "model": settings.model_name,
                        "prompt": prompt,
                        "stream": False,
                    },
                )
                response.raise_for_status()

            data = response.json()
            text = data.get("response", "").strip()

            if not text:
                raise LLMServiceError("Ollama returned an empty response.")

            logger.info(f"Received {len(text)} chars from Ollama")
            return text

        except httpx.ConnectError:
            last_error = LLMServiceError(
                "Cannot connect to Ollama. Is it running on localhost:11434?"
            )
            logger.warning(f"Connection failed (attempt {attempt + 1})")
        except httpx.TimeoutException:
            last_error = LLMServiceError(
                "Ollama request timed out after 120s. The model may be overloaded."
            )
            logger.warning(f"Timeout (attempt {attempt + 1})")
        except httpx.HTTPStatusError as e:
            raise LLMServiceError(
                f"Ollama returned HTTP {e.response.status_code}: {e.response.text}"
            )
        except KeyError:
            raise LLMServiceError(f"Unexpected Ollama response format: {data}")

    raise last_error