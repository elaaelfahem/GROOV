"""
Persistent session state store — SQLite-backed.

Tracks per-session data like turn count, topic, mode, quiz scores, mastery,
and conversation history. Linked to user accounts for cross-session persistence.

Uses an in-memory cache for fast reads, with SQLite writes on every update.
"""

import json
import logging
from datetime import datetime
from app.services.auth_service import _get_db

logger = logging.getLogger(__name__)

# ── In-memory cache (hot sessions) ──
_cache: dict[str, dict] = {}


def _default_session(session_id: str, user_id: int = 0) -> dict:
    """Return a fresh session dict."""
    return {
        "session_id": session_id,
        "user_id": user_id,
        "history": [],
        "mode": "teaching",
        "topic": "",
        "turn_count": 0,
        "created_at": datetime.now().isoformat(),
        "pomodoro_start": None,
        # ── Advanced Features ──
        "pdf_context": None,
        "pdf_filename": None,
        "mastery": 0,
        "waiting_for_feynman": False,
        "quiz_correct": 0,
        "quiz_total": 0,
        "user_emotion": "neutral",
        "streak": 0,
    }


def _row_to_session(row) -> dict:
    """Convert a SQLite row to a session dict."""
    session = _default_session(row["session_id"], row["user_id"])
    session["topic"] = row["topic"] or ""
    session["mode"] = row["mode"] or "teaching"
    session["turn_count"] = row["turn_count"] or 0
    session["mastery"] = row["mastery"] or 0
    session["quiz_correct"] = row["quiz_correct"] or 0
    session["quiz_total"] = row["quiz_total"] or 0
    session["streak"] = row["streak"] or 0
    session["user_emotion"] = row["user_emotion"] or "neutral"
    session["pdf_filename"] = row["pdf_filename"]
    session["created_at"] = row["created_at"]
    try:
        session["history"] = json.loads(row["history"] or "[]")
    except (json.JSONDecodeError, TypeError):
        session["history"] = []
    return session


# ═══════════════════════════════════════════════════════════════
#  GET / CREATE
# ═══════════════════════════════════════════════════════════════

def get_or_create_session(session_id: str, user_id: int = 0) -> dict:
    """Retrieve an existing session (from cache or DB) or create a new one."""
    # 1. Check cache
    if session_id in _cache:
        return _cache[session_id]

    # 2. Check database
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT * FROM study_sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        if row:
            session = _row_to_session(row)
            _cache[session_id] = session
            return session
    finally:
        conn.close()

    # 3. Create new
    session = _default_session(session_id, user_id)
    _cache[session_id] = session

    # Insert into DB
    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO study_sessions
               (user_id, session_id, topic, mode, turn_count, mastery,
                quiz_correct, quiz_total, streak, history, pdf_filename, user_emotion)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, session_id, "", "teaching", 0, 0, 0, 0, 0, "[]", None, "neutral"),
        )
        conn.commit()
    finally:
        conn.close()

    logger.info(f"Created new session: {session_id} (user_id={user_id})")
    return session


# ═══════════════════════════════════════════════════════════════
#  SAVE (persist current state to SQLite)
# ═══════════════════════════════════════════════════════════════

def save_session(session_id: str) -> None:
    """Write the in-memory session state to SQLite."""
    session = _cache.get(session_id)
    if not session:
        return

    conn = _get_db()
    try:
        # Serialize history as JSON
        history_json = json.dumps(session.get("history", [])[-50:])  # Keep last 50 messages

        conn.execute(
            """UPDATE study_sessions SET
               topic = ?, mode = ?, turn_count = ?, mastery = ?,
               quiz_correct = ?, quiz_total = ?, streak = ?,
               history = ?, pdf_filename = ?, user_emotion = ?,
               updated_at = datetime('now')
               WHERE session_id = ?""",
            (
                session.get("topic", ""),
                session.get("mode", "teaching"),
                session.get("turn_count", 0),
                session.get("mastery", 0),
                session.get("quiz_correct", 0),
                session.get("quiz_total", 0),
                session.get("streak", 0),
                history_json,
                session.get("pdf_filename"),
                session.get("user_emotion", "neutral"),
                session_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
#  LOAD USER SESSION — Get a user's most recent session
# ═══════════════════════════════════════════════════════════════

def load_user_session(user_id: int) -> dict | None:
    """Load the most recent session for a user from the database."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT * FROM study_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
        if row:
            session = _row_to_session(row)
            _cache[session["session_id"]] = session
            return session
        return None
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
#  UTILITY
# ═══════════════════════════════════════════════════════════════

def get_session(session_id: str) -> dict | None:
    """Retrieve a session if it exists, otherwise return None."""
    if session_id in _cache:
        return _cache[session_id]
    return None


def delete_session(session_id: str) -> bool:
    """Delete a session from cache and database."""
    if session_id in _cache:
        del _cache[session_id]
    conn = _get_db()
    try:
        conn.execute("DELETE FROM study_sessions WHERE session_id = ?", (session_id,))
        conn.commit()
    finally:
        conn.close()
    logger.info(f"Deleted session: {session_id}")
    return True


def list_sessions() -> list[str]:
    """Return all active session IDs."""
    return list(_cache.keys())
