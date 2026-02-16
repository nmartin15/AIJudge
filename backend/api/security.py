"""Session and case ownership helpers for API routes."""

import hmac
import logging
import time
import uuid
from collections.abc import Sequence
from typing import Annotated
from typing import Any

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from db.connection import get_db
from models.database import Case, OperatorRole, Session

logger = logging.getLogger(__name__)

# ─── Session activity tracking ────────────────────────────────────────────────
# In-memory cache of recently-touched session IDs.  We only issue a DB UPDATE
# once per _ACTIVITY_TOUCH_INTERVAL seconds per session, keeping the overhead
# of activity tracking near zero on the hot path.
_session_activity_cache: dict[uuid.UUID, float] = {}
_ACTIVITY_TOUCH_INTERVAL = 3600  # 1 hour
_ACTIVITY_CACHE_MAX_SIZE = 10_000


async def _touch_session_activity(db: AsyncSession, session_uuid: uuid.UUID) -> None:
    """Update sessions.last_active, throttled to at most once per hour."""
    now = time.monotonic()
    if now - _session_activity_cache.get(session_uuid, 0) < _ACTIVITY_TOUCH_INTERVAL:
        return

    try:
        await db.execute(
            text("UPDATE sessions SET last_active = now() WHERE id = :sid"),
            {"sid": session_uuid},
        )
    except Exception:
        logger.debug("Failed to touch session activity for %s", session_uuid)
        return

    _session_activity_cache[session_uuid] = now

    # Prevent unbounded cache growth: evict oldest entries when oversized
    if len(_session_activity_cache) > _ACTIVITY_CACHE_MAX_SIZE:
        sorted_entries = sorted(_session_activity_cache.items(), key=lambda kv: kv[1])
        for key, _ in sorted_entries[: len(sorted_entries) // 2]:
            _session_activity_cache.pop(key, None)

SessionHeader = Annotated[str | None, Header(alias="X-Session-Id")]
AdminKeyHeader = Annotated[str | None, Header(alias="X-Admin-Key")]


def optional_session_header(session_id: SessionHeader = None) -> str | None:
    """Dependency for optional X-Session-Id header access."""
    return session_id


def optional_admin_key_header(admin_key: AdminKeyHeader = None) -> str | None:
    """Dependency for optional X-Admin-Key header access."""
    return admin_key


def required_session_header(session_id: SessionHeader = None) -> str:
    """Dependency that enforces X-Session-Id header presence and format."""
    require_session_id(session_id)
    return session_id or ""


def parse_optional_session_id(session_id: str | None) -> uuid.UUID | None:
    """Parse an optional session ID header into UUID."""
    if session_id is None:
        return None
    try:
        return uuid.UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid X-Session-Id header") from exc


def require_session_id(session_id: str | None) -> uuid.UUID:
    """Require and parse a session ID header."""
    parsed = parse_optional_session_id(session_id)
    if parsed is None:
        raise HTTPException(status_code=401, detail="X-Session-Id header is required")
    return parsed


async def get_or_create_session(db: AsyncSession, session_id: str | None) -> Session:
    """Resolve an existing session by header or create a new one."""
    parsed = parse_optional_session_id(session_id)
    if parsed is not None:
        session = await db.get(Session, parsed)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session

    session = Session()
    db.add(session)
    await db.flush()
    return session


def is_admin_key_valid(admin_key: str | None) -> bool:
    """Validate an admin bootstrap key from config (constant-time)."""
    if not admin_key:
        return False
    settings = get_settings()
    return any(
        hmac.compare_digest(admin_key, stored_key)
        for stored_key in settings.admin_api_keys
    )


def apply_admin_claim(session: Session, admin_key: str | None) -> bool:
    """Apply admin role to a session if the key is valid."""
    if not is_admin_key_valid(admin_key):
        return False
    session.role = OperatorRole.ADMIN
    return True


async def get_session_by_header(
    db: AsyncSession = Depends(get_db),
    session_id: str = Depends(required_session_header),
) -> Session:
    """Resolve a session from X-Session-Id, requiring it to exist."""
    session_uuid = require_session_id(session_id)
    session = await db.get(Session, session_uuid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await _touch_session_activity(db, session_uuid)
    return session


async def require_admin_session(
    db: AsyncSession = Depends(get_db),
    session_id: str = Depends(required_session_header),
) -> Session:
    """Require an authenticated session with admin role."""
    session = await get_session_by_header(db, session_id)
    if session.role != OperatorRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin role required")
    return session


async def get_owned_case(
    db: AsyncSession,
    case_id: uuid.UUID,
    session_id: str | None,
    options: Sequence[Any] = (),
) -> Case:
    """Load a case only if it belongs to the current session."""
    session_uuid = require_session_id(session_id)
    stmt = select(Case).where(Case.id == case_id, Case.session_id == session_uuid)
    if options:
        stmt = stmt.options(*options)

    result = await db.execute(stmt)
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Lightweight activity tracking (at most 1 DB write per hour per session)
    await _touch_session_activity(db, session_uuid)

    return case
