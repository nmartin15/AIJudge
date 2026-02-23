import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from fastapi import FastAPI, Request
from sqlalchemy import select
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from api.error_handlers import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from config import get_settings
from db.connection import engine, AsyncSessionLocal, get_pool_status
import db.events  # noqa: F401 — registers SQLAlchemy event listeners
from logging_config import setup_logging
from models.database import Session as SessionModel

settings = get_settings()
setup_logging()
logger = logging.getLogger(__name__)


async def _purge_stale_sessions() -> int:
    """Delete sessions idle longer than session_max_idle_days using bulk SQL.

    Performs a single DELETE per batch directly in SQL — no ORM objects loaded
    into memory.  CASCADE foreign keys handle dependent rows automatically.
    Returns the total number of sessions deleted.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.session_max_idle_days)
    batch_size = 500
    total_deleted = 0

    while True:
        async with AsyncSessionLocal() as db:
            try:
                # Subquery selects a batch of stale session IDs
                stale_ids = (
                    select(SessionModel.id)
                    .where(SessionModel.last_active < cutoff)
                    .limit(batch_size)
                    .scalar_subquery()
                )
                result = await db.execute(
                    sa.delete(SessionModel).where(SessionModel.id.in_(stale_ids))
                )
                await db.commit()
                deleted = result.rowcount
                total_deleted += deleted
                if deleted < batch_size:
                    break
            except Exception:
                await db.rollback()
                raise

    return total_deleted


async def _session_cleanup_loop() -> None:
    """Background loop that periodically purges stale sessions."""
    interval = settings.session_cleanup_interval_hours * 3600
    while True:
        await asyncio.sleep(interval)
        try:
            deleted = await _purge_stale_sessions()
            if deleted:
                logger.info("Session cleanup: purged %d stale session(s).", deleted)
        except Exception as exc:
            logger.warning("Session cleanup failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify database connection (tables managed by Alembic migrations)
    db_available = False
    try:
        async with engine.begin() as conn:
            await conn.execute(sa.text("SELECT 1"))
        db_available = True
        logger.info("Database connection verified. Run 'alembic upgrade head' if tables are missing.")
    except Exception as e:
        logger.warning(f"Could not connect to database: {e}")
        logger.warning("App starting without DB — configure DATABASE_URL in .env")

    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Start the background session-cleanup task
    cleanup_task = None
    if db_available:
        cleanup_task = asyncio.create_task(_session_cleanup_loop())

    yield

    # Shutdown
    if cleanup_task is not None:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass

    try:
        await engine.dispose()
    except Exception:
        pass


app = FastAPI(
    title=settings.app_name,
    description="AI-powered small claims court simulation for Wyoming jurisdiction",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request for traceability."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "X-Session-Id",
        "X-Admin-Key",
        "X-Request-Id",
    ],
    expose_headers=["X-Request-Id"],
)


# ─── Register Routers ─────────────────────────────────────────────────────────

from api.cases import router as cases_router
from api.auth import router as auth_router
from api.hearing import router as hearing_router
from api.judgment import router as judgment_router
from api.comparison import router as comparison_router
from api.corpus import router as corpus_router

app.include_router(cases_router, tags=["Cases"])
app.include_router(auth_router, tags=["Auth"])
app.include_router(hearing_router, tags=["Hearings"])
app.include_router(judgment_router, tags=["Judgments"])
app.include_router(comparison_router, tags=["Comparisons"])
app.include_router(corpus_router, tags=["Corpus & Archetypes"])
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


@app.get("/health")
async def health_check(detail: bool = False):
    """Public health check. Add ?detail=true with a valid admin session for internals."""
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(sa.text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    status = "healthy" if db_ok else "degraded"
    response: dict[str, object] = {
        "status": status,
        "service": settings.app_name,
    }

    # Only expose internal diagnostics when explicitly requested
    if detail:
        response["version"] = "0.1.0"
        response["checks"] = {
            "database": "ok" if db_ok else "unreachable",
        }
        try:
            response["pool"] = get_pool_status()
        except Exception:
            response["pool"] = "unavailable"

    return response
