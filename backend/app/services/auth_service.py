"""
Authentication service — SQLite + bcrypt + JWT.

Handles user registration, login, and token verification.
Database file: backend/data/users.db
"""

import os
import sqlite3
import logging
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt, JWTError

logger = logging.getLogger(__name__)

# ── Config ──
SECRET_KEY = os.getenv("JWT_SECRET", "studygroup-secret-change-me-in-prod-2024")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 72

# ── Password hashing ──
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Database path ──
DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
DB_PATH = os.path.join(DB_DIR, "users.db")


def _get_db() -> sqlite3.Connection:
    """Get a SQLite connection with row factory."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the users and study_sessions tables if they don't exist."""
    conn = _get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS study_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            topic TEXT DEFAULT '',
            mode TEXT DEFAULT 'teaching',
            turn_count INTEGER DEFAULT 0,
            mastery INTEGER DEFAULT 0,
            quiz_correct INTEGER DEFAULT 0,
            quiz_total INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            history TEXT DEFAULT '[]',
            pdf_filename TEXT,
            user_emotion TEXT DEFAULT 'neutral',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()
    logger.info("Auth database initialized")


# Initialize on import
init_db()


# ═══════════════════════════════════════════════════════════════
#  REGISTRATION
# ═══════════════════════════════════════════════════════════════

def register_user(username: str, email: str, password: str) -> dict:
    """Register a new user. Returns user dict or raises ValueError."""
    email = email.lower().strip()
    username = username.strip()

    if not username or not email or not password:
        raise ValueError("All fields are required")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    if "@" not in email:
        raise ValueError("Invalid email address")

    conn = _get_db()
    try:
        # Check if email already exists
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise ValueError("An account with this email already exists")

        password_hash = pwd_context.hash(password)
        cursor = conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, password_hash),
        )
        conn.commit()
        user_id = cursor.lastrowid
        logger.info(f"User registered: {username} ({email})")

        return {"id": user_id, "username": username, "email": email}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
#  LOGIN
# ═══════════════════════════════════════════════════════════════

def login_user(email: str, password: str) -> dict:
    """Verify credentials and return a JWT token. Raises ValueError on failure."""
    email = email.lower().strip()

    conn = _get_db()
    try:
        user = conn.execute(
            "SELECT id, username, email, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()

        if not user:
            raise ValueError("Invalid email or password")

        if not pwd_context.verify(password, user["password_hash"]):
            raise ValueError("Invalid email or password")

        # Generate JWT
        token = _create_token(user_id=user["id"], username=user["username"], email=user["email"])
        logger.info(f"User logged in: {user['username']}")

        return {
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
            },
        }
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
#  TOKEN MANAGEMENT
# ═══════════════════════════════════════════════════════════════

def _create_token(user_id: int, username: str, email: str) -> str:
    """Create a signed JWT token."""
    payload = {
        "sub": str(user_id),
        "username": username,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Decode and verify a JWT token. Returns user info or raises ValueError."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {
            "id": int(payload["sub"]),
            "username": payload["username"],
            "email": payload["email"],
        }
    except JWTError as e:
        raise ValueError(f"Invalid or expired token: {e}")
