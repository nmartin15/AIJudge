"""Authentication and role-claim endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.security import (
    get_session_by_header,
    is_admin_key_valid,
    required_session_header,
)
from db.connection import get_db
from models.database import OperatorRole
from models.schemas import AdminLoginRequest, AuthMeResponse, SessionResponse

router = APIRouter()


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
        is_admin=session.role == OperatorRole.ADMIN,
    )


@router.post("/auth/admin-login", response_model=SessionResponse)
async def claim_admin_role(
    body: AdminLoginRequest,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Promote a session to admin when provided a valid admin key."""
    session = await get_session_by_header(db, session_id)
    if not is_admin_key_valid(body.admin_key):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    session.role = OperatorRole.ADMIN
    await db.flush()
    await db.refresh(session)
    return session
