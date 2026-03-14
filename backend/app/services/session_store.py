"""
In-memory session state store.

Tracks per-session data like turn count, topic, and mode so that
features like Organizer persona triggering and Pomodoro timers can work.

NOTE: This is ephemeral — sessions are lost on server restart.
For production, replace with Redis or a database.
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)

_sessions: dict[str, dict] = {}


def get_or_create_session(session_id: str) -> dict:
    """Retrieve an existing session or create a new one."""
    if session_id not in _sessions:
        _sessions[session_id] = {
            "history": [],
            "mode": "teaching",
            "topic": "",
            "turn_count": 0,
            "created_at": datetime.now().isoformat(),
            "pomodoro_start": None,
        }
        logger.info(f"Created new session: {session_id}")
    return _sessions[session_id]


def get_session(session_id: str) -> dict | None:
    """Retrieve a session if it exists, otherwise return None."""
    return _sessions.get(session_id)


def delete_session(session_id: str) -> bool:
    """Delete a session. Returns True if it existed."""
    if session_id in _sessions:
        del _sessions[session_id]
        logger.info(f"Deleted session: {session_id}")
        return True
    return False


def list_sessions() -> list[str]:
    """Return all active session IDs."""
    return list(_sessions.keys())
