import logging
import io
import os
import threading
from fastapi import APIRouter, UploadFile, File, Form, Header
from app.models import (
    SessionRespondRequest,
    SessionRespondResponse,
    PersonaResponse,
    EvaluationResult,
    FeynmanRequest,
    FeynmanResponse,
    SessionEvalRequest,
    SessionEvalResponse,
)
from app.services.evaluator_service import evaluate_message
from app.services.orchestrator_service import run_pipeline, evaluate_explanation, evaluate_session, analyze_emotion, detect_struggle
from app.services.session_store import get_or_create_session, save_session, load_user_session
from app.services.auth_service import verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/session", tags=["session"])

# Track RAG ingestion status per session
_rag_status = {}   # session_id -> {"status": "processing"|"ready"|"error", "filename": str}


@router.post("/respond", response_model=SessionRespondResponse)
async def session_respond(payload: SessionRespondRequest, authorization: str = Header(default="")):
    logger.info(f"Request received for session: {payload.session_id}")

    # Extract user_id from token
    user_id = 0
    token = authorization.replace("Bearer ", "").strip()
    if token:
        try:
            user_info = verify_token(token)
            user_id = user_info["id"]
        except ValueError:
            pass

    session = get_or_create_session(payload.session_id, user_id=user_id)

    # ── 1. Sentiment Analysis — combine camera + text ──
    camera_emotion = payload.user_emotion or "neutral"
    emotion_result = await analyze_emotion(payload.user_message, camera_emotion)
    unified_emotion = emotion_result.get("emotion", "NEUTRAL").lower()
    emotion_intensity = emotion_result.get("intensity", "low")
    logger.info(f"Sentiment: {unified_emotion} ({emotion_intensity}) — trigger: {emotion_result.get('trigger', '')}")

    # Store emotion in session for tracking
    session["user_emotion"] = unified_emotion
    session["emotion_intensity"] = emotion_intensity

    # ── 2. RAG Retrieval — semantic search from uploaded docs ──
    course_context = payload.course_context

    if not course_context and session.get("has_rag_context"):
        try:
            from app.rag.retrieve import retrieve
            results = retrieve(query=payload.user_message, top_k=3)
            if results:
                course_context = "EXCERPTS FROM UPLOADED COURSE MATERIALS:\n" + "\n---\n".join(
                    [f"(Page {r['page_number']}): {r['text']}" for r in results]
                )
                logger.info(f"RAG pulled {len(results)} relevant chunks for: '{payload.user_message[:60]}'")
        except FileNotFoundError:
            pass
        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")

    if not course_context and session.get("pdf_context"):
        course_context = session["pdf_context"]

    # ── 3. Message Evaluation ──
    evaluation_dict = await evaluate_message(
        history=payload.history, user_message=payload.user_message
    )
    logger.info(f"Evaluation: {evaluation_dict}")

    # ── 4. Struggle Detection — auto-switch to deep mode ──
    mode = payload.mode
    struggle_result = await detect_struggle(
        user_message=payload.user_message,
        recent_history=payload.history,
        topic=payload.topic,
    )
    struggle_mode_switch = None
    if struggle_result.get("struggling") and mode != "deep_understanding":
        struggle_mode_switch = "deep_understanding"
        weak_area = struggle_result.get("weak_area", payload.topic)
        logger.info(f"Struggle detected! Weak area: {weak_area} — suggesting deep mode")

    # ── 5. Run Pipeline ──
    replies, suggested_mode = await run_pipeline(
        topic=payload.topic,
        mode=mode,
        history=payload.history,
        user_message=payload.user_message,
        course_context=course_context,
        evaluation=evaluation_dict,
        turn_count=session["turn_count"],
        user_emotion=unified_emotion,
    )

    # Struggle detection overrides normal mode suggestion
    if struggle_mode_switch:
        suggested_mode = struggle_mode_switch

    session["turn_count"] += 1
    session["topic"] = payload.topic

    # Save messages to history for persistence
    if not isinstance(session.get("history"), list):
        session["history"] = []
    
    session["history"].append({"role": "user", "content": payload.user_message})
    for r in replies:
        session["history"].append({"speaker": r["persona"], "content": r["message"]})

    logger.info(
        f"Pipeline finished — {len(replies)} replies, "
        f"turn {session['turn_count']}, suggested_mode={suggested_mode}"
    )

    # Persist session to SQLite
    save_session(payload.session_id)

    return SessionRespondResponse(
        responses=[PersonaResponse(**r) for r in replies],
        evaluation=EvaluationResult(**evaluation_dict),
        suggested_mode=suggested_mode,
        detected_emotion=unified_emotion,
        emotion_intensity=emotion_intensity,
    )


# ═══════════════════════════════════════════════════════════════
#  LOAD SESSION — Restore user's last session on login
# ═══════════════════════════════════════════════════════════════

@router.get("/load")
async def load_session(authorization: str = Header(default="")):
    """Load the user's most recent study session."""
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return {"found": False}

    try:
        user = verify_token(token)
    except ValueError:
        return {"found": False}

    session = load_user_session(user["id"])
    if session:
        return {
            "found": True,
            "session_id": session["session_id"],
            "topic": session.get("topic", ""),
            "mode": session.get("mode", "teaching"),
            "turn_count": session.get("turn_count", 0),
            "mastery": session.get("mastery", 0),
            "quiz_correct": session.get("quiz_correct", 0),
            "quiz_total": session.get("quiz_total", 0),
            "streak": session.get("streak", 0),
            "history": session.get("history", []),
            "pdf_filename": session.get("pdf_filename"),
        }
    return {"found": False}


# ═══════════════════════════════════════════════════════════════
#  PDF UPLOAD & RAG — Ingest Lecture Notes (Background Thread)
# ═══════════════════════════════════════════════════════════════

def _run_ingestion(save_path: str, session_id: str, filename: str):
    """Run heavy RAG ingestion in a background thread so the API responds fast."""
    try:
        from app.rag.ingest import ingest_pdf
        logger.info(f"[BG] Starting RAG ingestion for {filename}...")
        ingest_pdf(save_path)

        # Mark session as RAG-ready
        session = get_or_create_session(session_id)
        session["has_rag_context"] = True

        # Auto-detect topic from first page of PDF
        detected_topic = _extract_topic_from_pdf(save_path)
        if detected_topic:
            session["auto_topic"] = detected_topic
            _rag_status[session_id] = {"status": "ready", "filename": filename, "detected_topic": detected_topic}
            logger.info(f"[BG] RAG ingestion complete. Detected topic: '{detected_topic}'")
        else:
            _rag_status[session_id] = {"status": "ready", "filename": filename}
            logger.info(f"[BG] RAG ingestion complete for {filename}")
    except Exception as e:
        _rag_status[session_id] = {"status": "error", "filename": filename, "error": str(e)}
        logger.error(f"[BG] RAG ingestion failed for {filename}: {e}")


def _extract_topic_from_pdf(pdf_path: str) -> str:
    """Extract the main subject/topic from the first page of the PDF."""
    try:
        from app.rag.pdf_utils import extract_text_from_pdf
        pages = extract_text_from_pdf(pdf_path)
        if not pages:
            return ""

        # Take first page text (and a bit of second page if available)
        first_page_text = pages[0].get("text", "")[:800]
        if len(pages) > 1:
            first_page_text += "\n" + pages[1].get("text", "")[:400]

        if not first_page_text.strip():
            return ""

        # Use Ollama to extract the topic
        import asyncio
        from app.services.llm_service import call_ollama

        prompt = f"""Read the following excerpt from a course document and identify the MAIN SUBJECT or TOPIC being taught. 
Return ONLY the topic name in a few words (e.g., "Sequence Diagrams in UML", "Cell Biology", "Linear Algebra").
Do NOT explain anything. Just the topic name.

Document excerpt:
{first_page_text}

Topic name:"""

        # Run async function from sync context
        loop = asyncio.new_event_loop()
        topic = loop.run_until_complete(call_ollama(prompt))
        loop.close()

        # Clean up the response
        topic = topic.strip().strip('"').strip("'").strip(".")
        # Take just the first line in case model rambles
        topic = topic.split("\n")[0].strip()
        if len(topic) > 80:
            topic = topic[:80]

        return topic
    except Exception as e:
        logger.error(f"Topic extraction failed: {e}")
        return ""


@router.post("/upload")
async def upload_notes(
    session_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Upload a PDF and start RAG ingestion in the background."""
    session = get_or_create_session(session_id)

    if not file.filename.endswith(".pdf"):
        return {"success": False, "error": "Only PDF files are accepted."}

    upload_dir = "data/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, file.filename)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    session["pdf_filename"] = file.filename

    # Start ingestion in background thread — respond immediately
    _rag_status[session_id] = {"status": "processing", "filename": file.filename}
    thread = threading.Thread(
        target=_run_ingestion,
        args=(save_path, session_id, file.filename),
        daemon=True,
    )
    thread.start()

    logger.info(f"PDF saved, ingestion started in background for: {file.filename}")

    return {
        "success": True,
        "filename": file.filename,
        "characters": len(content),
        "message": "PDF uploaded! Indexing in background...",
    }


@router.get("/upload-status")
async def upload_status(session_id: str):
    """Check if the RAG ingestion is done."""
    info = _rag_status.get(session_id, {"status": "none"})
    return info


# ═══════════════════════════════════════════════════════════════
#  FEYNMAN METHOD — Evaluate student explanations
# ═══════════════════════════════════════════════════════════════

@router.post("/feynman", response_model=FeynmanResponse)
async def handle_feynman(payload: FeynmanRequest, authorization: str = Header(default="")):
    logger.info(f"Feynman explanation received for session: {payload.session_id}")

    user_id = 0
    token = authorization.replace("Bearer ", "").strip()
    if token:
        try:
            user_info = verify_token(token)
            user_id = user_info["id"]
        except ValueError:
            pass

    session = get_or_create_session(payload.session_id, user_id=user_id)

    course_context = payload.course_context
    if not course_context and session.get("pdf_context"):
        course_context = session["pdf_context"]

    result = await evaluate_explanation(
        student_explanation=payload.student_explanation,
        topic=payload.topic,
        course_context=course_context,
    )
    logger.info(f"Feynman evaluation: score={result.get('score', 0)}")

    return FeynmanResponse(**result)


# ═══════════════════════════════════════════════════════════════
#  SESSION EVALUATION — End-of-session mastery scoring
# ═══════════════════════════════════════════════════════════════

@router.post("/evaluate", response_model=SessionEvalResponse)
async def session_evaluate(payload: SessionEvalRequest):
    """Evaluate the student's overall session performance."""
    result = await evaluate_session(
        history=payload.history,
        topic=payload.topic,
    )
    logger.info(f"Session evaluation: score={result.get('score', 0)}")

    return SessionEvalResponse(**result)