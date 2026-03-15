from typing import List, Optional, Literal
from pydantic import BaseModel

StudyMode = Literal["teaching", "exam_prep", "deep_understanding", "quick_review"]
MessageType = Literal["question", "explanation", "confusion", "quiz_answer", "other"]
QualityType = Literal["strong", "partial", "weak", "unknown"]


class SessionRespondRequest(BaseModel):
    session_id: str
    topic: str
    mode: StudyMode
    user_message: str
    history: str = ""
    course_context: str = ""
    user_emotion: str = "neutral"


class PersonaResponse(BaseModel):
    speaker: str
    text: str


class EvaluationResult(BaseModel):
    message_type: MessageType
    quality: QualityType


class SessionRespondResponse(BaseModel):
    responses: List[PersonaResponse]
    evaluation: EvaluationResult
    suggested_mode: Optional[StudyMode] = None
    detected_emotion: str = "neutral"
    emotion_intensity: str = "low"


# ── Feynman Method ──
class FeynmanRequest(BaseModel):
    session_id: str
    topic: str
    student_explanation: str
    course_context: str = ""


class FeynmanResponse(BaseModel):
    correct: List[str] = []
    missing: List[str] = []
    score: int = 0
    improvement: str = ""
    good_analogy: bool = False


# ── Session Evaluation ──
class SessionEvalRequest(BaseModel):
    session_id: str
    topic: str
    history: str = ""


class SessionEvalResponse(BaseModel):
    score: int = 70
    feedback: str = "Good session!"
    strong_areas: List[str] = []
    review_areas: List[str] = []