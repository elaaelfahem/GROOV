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