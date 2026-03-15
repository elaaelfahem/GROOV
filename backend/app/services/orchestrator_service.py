import json
import re
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
    user_emotion: str = "neutral",
) -> str:
    emotion_note = ""
    if user_emotion and user_emotion != "neutral":
        emotion_note = f"""
[SYSTEM NOTE: The student's face currently shows they are feeling: {user_emotion.upper()}.
Acknowledge this naturally if it fits the context, or adjust your tone accordingly.]
"""

    # When course material is available, make it the PRIMARY focus
    if course_context and "EXCERPTS FROM UPLOADED COURSE MATERIALS" in course_context:
        context_block = f"""
=== UPLOADED COURSE MATERIAL (PRIMARY SOURCE — USE THIS!) ===
{course_context}
=== END COURSE MATERIAL ===

IMPORTANT: Your response MUST be grounded in the course material above.
Do NOT give generic answers. Reference specific content from the excerpts.
The student uploaded this material to study from it specifically.

Study session topic hint: {topic}
"""
    else:
        context_block = f"""
Current topic: {topic}

Course context: {course_context if course_context else "No course materials uploaded yet. Answer based on general knowledge."}
"""

    return f"""
{SHARED_CONTEXT}

Current study mode: {mode}

{context_block}

Conversation so far:
{history}

Latest student message:
{user_message}

{emotion_note}

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
    user_emotion: str = "neutral",
) -> str:
    prompt = build_persona_prompt(
        persona_name=persona_name,
        topic=topic,
        mode=mode,
        history=history,
        user_message=user_message,
        course_context=course_context,
        user_emotion=user_emotion,
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
    user_emotion: str = "neutral",
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
            user_emotion=user_emotion,
        )

        replies.append({"speaker": speaker, "text": text})
        running_history += f"\n{speaker}: {text}"

    suggested = suggest_mode(
        current_mode=mode,
        message_type=evaluation["message_type"],
        quality=evaluation["quality"],
    )

    return replies, suggested


# ═══════════════════════════════════════════════════════════════
#  FEYNMAN METHOD — Evaluate student explanations
# ═══════════════════════════════════════════════════════════════

async def evaluate_explanation(student_explanation: str, topic: str, course_context: str = "") -> dict:
    """Use the LLM to evaluate how well a student explained a concept (Feynman method)."""
    prompt = f"""A student explained "{topic}" in their own words. Evaluate their explanation.

Student's explanation: "{student_explanation}"
{f'Course material: {course_context[:800]}' if course_context else ''}

Evaluate and respond with JSON only:
{{
  "correct": ["list of correct points"],
  "good_analogy": true/false,
  "missing": ["list of missing/incomplete points"],
  "score": 0-100,
  "improvement": "one sentence on what to add"
}}"""

    try:
        raw = await call_ollama(prompt)
        cleaned = re.sub(r"```json\s*", "", raw)
        cleaned = re.sub(r"```\s*", "", cleaned)
        json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        logger.error(f"Feynman evaluation failed: {e}")

    return {"correct": [], "missing": [], "score": 50, "improvement": "Try adding more detail.", "good_analogy": False}


# ═══════════════════════════════════════════════════════════════
#  SESSION EVALUATION — End-of-session mastery scoring
# ═══════════════════════════════════════════════════════════════

async def evaluate_session(history: str, topic: str) -> dict:
    """Evaluate the student's overall session performance."""
    prompt = f"""Based on this study session on "{topic}", evaluate the student's understanding.

Conversation during session:
{history[:2000]}

Respond with JSON only:
{{
  "score": 0-100,
  "feedback": "2-3 sentence assessment",
  "strong_areas": ["what they understood well"],
  "review_areas": ["what to review"]
}}"""

    try:
        raw = await call_ollama(prompt)
        cleaned = re.sub(r"```json\s*", "", raw)
        cleaned = re.sub(r"```\s*", "", cleaned)
        json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        logger.error(f"Session evaluation failed: {e}")

    return {"score": 70, "feedback": "Good session! Keep reviewing the material.", "strong_areas": [], "review_areas": []}


# ═══════════════════════════════════════════════════════════════
#  SENTIMENT ANALYSIS — Emotional Intelligence Engine
# ═══════════════════════════════════════════════════════════════

STRUGGLE_KEYWORDS = [
    "don't understand", "confused", "lost", "what?", "huh",
    "i don't get", "not sure", "what does", "what is", "help",
    "don't know", "no idea", "wrong", "mistake", "je comprends pas",
    "pas compris", "c'est quoi",
]


async def analyze_emotion(user_message: str, camera_emotion: str = "neutral") -> dict:
    """
    Combine text sentiment + camera expression into a unified emotional state.
    Ported from teammate's Emotional Intelligence Engine (Mistral → Ollama).
    """
    prompt = f"""You are the EMOTIONAL INTELLIGENCE ENGINE of a study group AI.
Analyze the student's message AND physical expression to classify into ONE final emotional state.

SAD        → "I can't do this", "I give up", physical sadness
CONFUSED   → genuinely lost, "I don't get it", physical confusion
HAPPY      → "I got it!", breakthrough moment, physical smiling 
STRESSED   → "exam tomorrow", time pressure, anxiety, physical tension
FRUSTRATED → "this makes no sense", repeated failure, physical anger
TIRED      → "I'm exhausted", "can't focus", physical fatigue
CONFIDENT  → strong correct answers, teaching tone
NEUTRAL    → no strong emotion

Also classify intensity: low | medium | high.

CRITICAL: If the camera shows distress (SAD, STRESSED, FRUSTRATED) or breakthrough (HAPPY), 
that emotion should be the final emotion EVEN IF the text is neutral.

Student Message: "{user_message}"
Camera Expression: "{camera_emotion.upper()}"

Return JSON only:
{{"emotion": "SAD|CONFUSED|HAPPY|STRESSED|FRUSTRATED|TIRED|CONFIDENT|NEUTRAL", "intensity": "low|medium|high", "trigger": "brief reason"}}"""

    try:
        raw = await call_ollama(prompt)
        cleaned = re.sub(r"```json\s*", "", raw)
        cleaned = re.sub(r"```\s*", "", cleaned)
        json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        logger.error(f"Emotion analysis failed: {e}")

    return {"emotion": "NEUTRAL", "intensity": "low", "trigger": "analysis unavailable"}


async def detect_struggle(user_message: str, recent_history: str, topic: str) -> dict:
    """
    Detect if the student is struggling — triggers adaptive deep understanding mode.
    Ported from teammate's Adaptive component (Mistral → Ollama).
    """
    # Fast keyword check first (no LLM call needed)
    lower = user_message.lower()
    keyword_match = any(k in lower for k in STRUGGLE_KEYWORDS)

    if not keyword_match:
        return {"struggling": False}

    # If keywords matched, confirm with LLM
    prompt = f"""You are an educational AI monitoring a student's understanding.

Topic: {topic}
Student's recent message: "{user_message}"
Recent conversation: {recent_history[-500:] if recent_history else "No history yet."}

Is this student showing signs of confusion or struggle?
Respond with JSON only: {{"struggling": true/false, "reason": "brief reason", "weak_area": "specific concept if struggling"}}"""

    try:
        raw = await call_ollama(prompt)
        cleaned = re.sub(r"```json\s*", "", raw)
        cleaned = re.sub(r"```\s*", "", cleaned)
        json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        logger.error(f"Struggle detection failed: {e}")

    # Fallback: if keywords matched, assume struggling
    return {"struggling": keyword_match, "reason": "keyword match", "weak_area": topic}