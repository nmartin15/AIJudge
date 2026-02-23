"""Authentication and role-claim endpoints."""

import asyncio

import fastapi
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.guardrails import FixedWindowRateLimiter, api_error
from api.security import (
    get_session_by_header,
    is_admin_key_valid,
    required_session_header,
    set_session_cookie,
)
from db.connection import get_db
from models.database import OperatorRole
from models.schemas import AdminLoginRequest, AuthMeResponse, SessionResponse

router = APIRouter()

_admin_login_limiter = FixedWindowRateLimiter(
    max_requests=5,
    window_seconds=900,  # 5 attempts per 15 minutes per session
)


@router.get("/auth/me", response_model=AuthMeResponse)
async def auth_me(
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Return trusted role claims for the current session."""
    session = await get_session_by_header(db, session_id)
    return AuthMeResponse(
        session_id=session.id,
        role=session.role,
        is_admin=session.role == OperatorRole.admin,
    )


@router.post("/auth/admin-login", response_model=SessionResponse)
async def claim_admin_role(
    body: AdminLoginRequest,
    response: fastapi.Response,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Promote a session to admin when provided a valid admin key."""
    await _admin_login_limiter.check(
        key=session_id,
        code="admin_login_rate_limited",
        message="Too many admin login attempts. Try again later.",
    )
    session = await get_session_by_header(db, session_id)
    if not is_admin_key_valid(body.admin_key):
        # Deliberate delay to slow brute-force attacks
        await asyncio.sleep(1.0)
        raise api_error(
            status_code=403,
            code="invalid_admin_key",
            message="Invalid admin key",
        )
    session.role = OperatorRole.admin
    await db.flush()
    await db.refresh(session)
    # Refresh the cookie to ensure it stays in sync
    set_session_cookie(response, str(session.id))
    return session
