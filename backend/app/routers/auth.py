"""
Authentication API routes — register, login, get current user.
"""

import logging
from fastapi import APIRouter, Header
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from app.services.auth_service import register_user, login_user, verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request/Response Models ──

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ═══════════════════════════════════════════════════════════════
#  REGISTER
# ═══════════════════════════════════════════════════════════════

@router.post("/register")
async def register(req: RegisterRequest):
    """Create a new user account."""
    try:
        user = register_user(req.username, req.email, req.password)
        # Auto-login after registration
        result = login_user(req.email, req.password)
        return {"success": True, "token": result["token"], "user": result["user"]}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


# ═══════════════════════════════════════════════════════════════
#  LOGIN
# ═══════════════════════════════════════════════════════════════

@router.post("/login")
async def login(req: LoginRequest):
    """Verify credentials and return a JWT token."""
    try:
        result = login_user(req.email, req.password)
        return {"success": True, "token": result["token"], "user": result["user"]}
    except ValueError as e:
        return JSONResponse(status_code=401, content={"success": False, "error": str(e)})


# ═══════════════════════════════════════════════════════════════
#  GET CURRENT USER
# ═══════════════════════════════════════════════════════════════

@router.get("/me")
async def get_me(authorization: str = Header(default="")):
    """Return user info from a valid JWT token."""
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return JSONResponse(status_code=401, content={"error": "No token provided"})

    try:
        user = verify_token(token)
        return {"success": True, "user": user}
    except ValueError as e:
        return JSONResponse(status_code=401, content={"error": str(e)})
