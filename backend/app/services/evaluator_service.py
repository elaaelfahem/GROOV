import json
import re
import logging
from app.prompts.evaluator import EVALUATOR_PROMPT
from app.services.llm_service import call_ollama

logger = logging.getLogger(__name__)

VALID_MESSAGE_TYPES = {"question", "explanation", "confusion", "quiz_answer", "other"}
VALID_QUALITIES = {"strong", "partial", "weak", "unknown"}

DEFAULT_EVALUATION = {"message_type": "other", "quality": "unknown"}


def _extract_json(raw: str) -> dict | None:
    """Extract a JSON object from LLM output, handling markdown fences and preamble."""
    # Strip markdown code fences
    cleaned = re.sub(r"```json\s*", "", raw)
    cleaned = re.sub(r"```\s*", "", cleaned)

    # Try to find a JSON object in the response
    json_match = re.search(r"\{.*?\}", cleaned, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            return None
    return None


def _validate_evaluation(data: dict) -> dict:
    """Ensure the evaluation has valid message_type and quality values."""
    msg_type = data.get("message_type", "other")
    quality = data.get("quality", "unknown")

    return {
        "message_type": msg_type if msg_type in VALID_MESSAGE_TYPES else "other",
        "quality": quality if quality in VALID_QUALITIES else "unknown",
    }


async def evaluate_message(history: str, user_message: str) -> dict:
    """Evaluate a student message by classifying its type and quality."""
    prompt = EVALUATOR_PROMPT.format(history=history, user_message=user_message)

    try:
        raw = await call_ollama(prompt)
        logger.info(f"Raw evaluator response: {raw[:200]}")

        parsed = _extract_json(raw)
        if parsed:
            result = _validate_evaluation(parsed)
            logger.info(f"Evaluation result: {result}")
            return result

        logger.warning(f"Could not parse evaluator JSON from: {raw[:200]}")
    except Exception as e:
        logger.error(f"Evaluator call failed: {e}")

    return DEFAULT_EVALUATION.copy()