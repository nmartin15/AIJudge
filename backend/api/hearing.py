"""Hearing simulation API endpoints with WebSocket support."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.guardrails import api_error
from api.security import get_owned_case, require_session_id, required_session_header
from db.connection import get_db, AsyncSessionLocal
from models.database import Case, CaseStatus, Hearing, HearingMessage, HearingMessageRole
from models.schemas import HearingResponse, HearingStart, HearingMessageCreate
from personas.archetypes import get_archetype
from prompts.system_prompts import generate_hearing_message
from services.hearing_service import build_case_context, process_hearing_exchange

router = APIRouter()

MAX_WS_MESSAGE_LENGTH = 10_000


@router.post("/cases/{case_id}/hearing", response_model=HearingResponse)
async def start_hearing(
    case_id: uuid.UUID,
    body: HearingStart,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Start a hearing simulation for a case."""
    case = await get_owned_case(
        db,
        case_id,
        session_id,
        options=(selectinload(Case.parties),),
    )

    archetype = get_archetype(body.archetype_id)

    # Check if hearing already exists
    existing = await db.execute(
        select(Hearing).where(Hearing.case_id == case_id)
    )
    if existing.scalar_one_or_none():
        raise api_error(
            status_code=409,
            code="hearing_exists",
            message="A hearing already exists for this case.",
        )

    # Create hearing
    hearing = Hearing(case_id=case_id, archetype_id=body.archetype_id)
    db.add(hearing)
    await db.flush()

    # Generate opening statement
    case_context = build_case_context(case, case.parties)
    opening = await generate_hearing_message(
        archetype_id=body.archetype_id,
        case_context=case_context,
        conversation_history=[],
    )

    # Save opening message
    msg = HearingMessage(
        hearing_id=hearing.id,
        role=HearingMessageRole.judge,
        content=opening["content"],
        sequence=1,
    )
    db.add(msg)
    await db.flush()

    # Update case status
    case.status = CaseStatus.hearing
    case.archetype_id = body.archetype_id
    await db.flush()

    # Reload with messages
    result = await db.execute(
        select(Hearing)
        .where(Hearing.id == hearing.id)
        .options(selectinload(Hearing.messages))
    )
    hearing = result.scalar_one()
    return hearing


@router.get("/cases/{case_id}/hearing", response_model=HearingResponse)
async def get_hearing(
    case_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Get the hearing for a case."""
    await get_owned_case(db, case_id, session_id)
    result = await db.execute(
        select(Hearing)
        .where(Hearing.case_id == case_id)
        .options(selectinload(Hearing.messages))
    )
    hearing = result.scalar_one_or_none()
    if not hearing:
        raise api_error(
            status_code=404,
            code="hearing_not_found",
            message="No hearing found for this case.",
        )
    return hearing


@router.websocket("/cases/{case_id}/hearing/ws")
async def hearing_websocket(websocket: WebSocket, case_id: str):
    """
    WebSocket endpoint for real-time hearing simulation.

    Client sends: {"role": "plaintiff"|"defendant", "content": "response text"}
    Server sends: {"role": "judge", "content": "judge's response", "sequence": N}
    """
    try:
        case_uuid = uuid.UUID(case_id)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid case ID")
        return

    session_candidate = websocket.headers.get("x-session-id") or websocket.query_params.get("session_id")
    try:
        session_uuid = require_session_id(session_candidate)
    except HTTPException as exc:
        # api_error() sets detail as a dict envelope; extract the message for WS close reason
        if isinstance(exc.detail, dict):
            reason = exc.detail.get("error", {}).get("message", "Authentication error")
        else:
            reason = str(exc.detail)
        await websocket.close(code=4401 if exc.status_code == 401 else 1008, reason=reason)
        return

    await websocket.accept()

    # Initial load: fetch hearing + case context, then release connection
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Hearing)
                .join(Case, Hearing.case_id == Case.id)
                .where(Hearing.case_id == case_uuid, Case.session_id == session_uuid)
                .options(selectinload(Hearing.messages))
            )
            hearing = result.scalar_one_or_none()
            if not hearing:
                await websocket.send_json({"error": "No hearing found"})
                await websocket.close()
                return

            hearing_id = hearing.id
            archetype_id = hearing.archetype_id

            case_result = await db.execute(
                select(Case)
                .where(Case.id == case_uuid)
                .options(selectinload(Case.parties))
            )
            case = case_result.scalar_one()
            case_context = build_case_context(case, case.parties)

            existing_messages = [
                {"role": msg.role.value, "content": msg.content, "sequence": msg.sequence}
                for msg in sorted(hearing.messages, key=lambda m: m.sequence)
            ]

        for msg_data in existing_messages:
            await websocket.send_json(msg_data)

    except WebSocketDisconnect:
        return
    except Exception:
        try:
            await websocket.send_json({"error": "Failed to load hearing"})
        except Exception:
            pass
        return

    # Message loop: acquire a fresh DB session per exchange
    try:
        while True:
            data = await websocket.receive_json()
            role_str = data.get("role", "plaintiff")
            content = data.get("content", "")

            if not content:
                continue

            if len(content) > MAX_WS_MESSAGE_LENGTH:
                await websocket.send_json({
                    "error": f"Message too long. Maximum {MAX_WS_MESSAGE_LENGTH} characters."
                })
                continue

            try:
                role_enum = HearingMessageRole(role_str)
                if role_enum == HearingMessageRole.judge:
                    await websocket.send_json({"error": "Cannot send messages as judge"})
                    continue
            except ValueError:
                await websocket.send_json({"error": f"Invalid role: {role_str}"})
                continue

            # Delegate to the shared hearing service
            async with AsyncSessionLocal() as db:
                try:
                    exchange = await process_hearing_exchange(
                        db,
                        hearing_id=hearing_id,
                        archetype_id=archetype_id,
                        case_context=case_context,
                        user_role=role_enum,
                        user_content=content,
                    )
                    await db.commit()
                except Exception:
                    await db.rollback()
                    raise

            await websocket.send_json({
                "role": HearingMessageRole.judge.value,
                "content": exchange.judge_content,
                "sequence": exchange.judge_sequence,
            })

            if exchange.concluded:
                await websocket.send_json({"event": "hearing_concluded"})

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.send_json({"error": "An unexpected error occurred during the hearing"})
        except Exception:
            pass


@router.post("/cases/{case_id}/hearing/message")
async def post_hearing_message(
    case_id: uuid.UUID,
    body: HearingMessageCreate,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """
    HTTP fallback for hearing interaction (for clients that can't use WebSocket).
    Accepts a party message and returns the judge's response.
    """
    await get_owned_case(db, case_id, session_id)

    result = await db.execute(
        select(Hearing)
        .where(Hearing.case_id == case_id)
        .options(selectinload(Hearing.messages))
    )
    hearing = result.scalar_one_or_none()
    if not hearing:
        raise api_error(
            status_code=404,
            code="hearing_not_found",
            message="No hearing found for this case.",
        )
    if hearing.completed_at:
        raise api_error(
            status_code=400,
            code="hearing_concluded",
            message="This hearing has already concluded.",
        )

    case_result = await db.execute(
        select(Case)
        .where(Case.id == case_id)
        .options(selectinload(Case.parties))
    )
    case = case_result.scalar_one()
    case_context = build_case_context(case, case.parties)

    # Delegate to the shared hearing service
    exchange = await process_hearing_exchange(
        db,
        hearing_id=hearing.id,
        archetype_id=hearing.archetype_id,
        case_context=case_context,
        user_role=HearingMessageRole(body.role.value),
        user_content=body.content,
    )

    return {
        "judge_message": {
            "role": HearingMessageRole.judge.value,
            "content": exchange.judge_content,
            "sequence": exchange.judge_sequence,
        },
        "hearing_concluded": exchange.concluded,
    }
