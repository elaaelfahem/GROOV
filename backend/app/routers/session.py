import logging
from fastapi import APIRouter
from app.models import (
    SessionRespondRequest,
    SessionRespondResponse,
    PersonaResponse,
    EvaluationResult,
)
from app.services.evaluator_service import evaluate_message
from app.services.orchestrator_service import run_pipeline
from app.services.session_store import get_or_create_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/session", tags=["session"])


@router.post("/respond", response_model=SessionRespondResponse)
async def session_respond(payload: SessionRespondRequest):
    logger.info(f"Request received for session: {payload.session_id}")

    # Get or create session state to track turn count
    session = get_or_create_session(payload.session_id)

    evaluation_dict = await evaluate_message(
        history=payload.history, user_message=payload.user_message
    )
    logger.info(f"Evaluation: {evaluation_dict}")

    replies, suggested_mode = await run_pipeline(
        topic=payload.topic,
        mode=payload.mode,
        history=payload.history,
        user_message=payload.user_message,
        course_context=payload.course_context,
        evaluation=evaluation_dict,
        turn_count=session["turn_count"],
    )

    # Update session state
    session["turn_count"] += 1
    session["topic"] = payload.topic
    logger.info(
        f"Pipeline finished — {len(replies)} replies, "
        f"turn {session['turn_count']}, suggested_mode={suggested_mode}"
    )

    return SessionRespondResponse(
        responses=[PersonaResponse(**r) for r in replies],
        evaluation=EvaluationResult(**evaluation_dict),
        suggested_mode=suggested_mode,
    )