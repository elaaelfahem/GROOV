import logging
from app.config import settings
from app.prompts.personas import SHARED_CONTEXT, PERSONAS
from app.prompts.modes import MODE_BEHAVIOR, ORGANIZER_TRIGGER_INTERVAL
from app.services.llm_service import call_ollama

logger = logging.getLogger(__name__)


def build_persona_prompt(
    persona_name: str,
    topic: str,
    mode: str,
    history: str,
    user_message: str,
    course_context: str,
) -> str:
    return f"""
{SHARED_CONTEXT}

Current study mode:
{mode}

Current topic:
{topic}

Relevant course context:
{course_context if course_context else "No course context provided."}

Conversation so far:
{history}

Latest student message:
{user_message}

{PERSONAS[persona_name]}
"""


def choose_speakers(
    mode: str, message_type: str, quality: str, turn_count: int = 0
) -> list[str]:
    """Select which personas should respond based on mode, message type, and quality."""
    mode_rules = MODE_BEHAVIOR.get(mode, MODE_BEHAVIOR["teaching"])
    max_turns = settings.max_persona_turns

    if message_type == "confusion":
        speakers = ["confused", "genius", "summarizer"]
    elif message_type == "question":
        speakers = mode_rules["preferred_order_for_question"][:max_turns]
    elif message_type == "explanation":
        if quality == "strong":
            speakers = ["skeptic", "summarizer"]
        elif quality == "partial":
            speakers = mode_rules["preferred_order_for_explanation"][:max_turns]
        else:
            speakers = ["genius", "skeptic", "summarizer"][:max_turns]
    elif message_type == "quiz_answer":
        speakers = ["skeptic", "genius"][:max_turns]
    else:
        speakers = ["genius", "summarizer"][:max_turns]

    # Inject the Organizer periodically to manage pacing and focus
    if (
        turn_count > 0
        and turn_count % ORGANIZER_TRIGGER_INTERVAL == 0
        and "organizer" not in speakers
    ):
        speakers.append("organizer")
        logger.info(f"Organizer injected at turn {turn_count}")

    return speakers


async def generate_persona_reply(
    persona_name: str,
    topic: str,
    mode: str,
    history: str,
    user_message: str,
    course_context: str,
) -> str:
    prompt = build_persona_prompt(
        persona_name=persona_name,
        topic=topic,
        mode=mode,
        history=history,
        user_message=user_message,
        course_context=course_context,
    )
    return await call_ollama(prompt)


def suggest_mode(current_mode: str, message_type: str, quality: str):
    """Suggest a mode change based on student performance signals."""
    if message_type == "confusion" and current_mode != "deep_understanding":
        return "deep_understanding"

    if message_type == "quiz_answer" and quality == "weak" and current_mode != "teaching":
        return "teaching"

    if message_type == "explanation" and quality == "strong" and current_mode == "teaching":
        return "exam_prep"

    return None


async def run_pipeline(
    topic: str,
    mode: str,
    history: str,
    user_message: str,
    course_context: str,
    evaluation: dict,
    turn_count: int = 0,
):
    """Run the full multi-agent pipeline: select speakers, generate replies sequentially."""
    speakers = choose_speakers(
        mode=mode,
        message_type=evaluation["message_type"],
        quality=evaluation["quality"],
        turn_count=turn_count,
    )
    logger.info(f"Selected speakers: {speakers}")

    replies = []
    running_history = history + f"\nStudent: {user_message}"

    for speaker in speakers:
        logger.info(f"Generating reply for: {speaker}")
        text = await generate_persona_reply(
            persona_name=speaker,
            topic=topic,
            mode=mode,
            history=running_history,
            user_message=user_message,
            course_context=course_context,
        )

        replies.append({"speaker": speaker, "text": text})
        running_history += f"\n{speaker}: {text}"

    suggested = suggest_mode(
        current_mode=mode,
        message_type=evaluation["message_type"],
        quality=evaluation["quality"],
    )

    return replies, suggested