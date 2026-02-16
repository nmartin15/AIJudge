"""Hearing simulation API endpoints with WebSocket support."""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.guardrails import api_error
from api.security import get_owned_case, require_session_id, required_session_header
from db.connection import get_db, AsyncSessionLocal
from models.database import Case, CaseStatus, Hearing, HearingMessage, HearingMessageRole, Party, PartyRole
from models.schemas import HearingResponse, HearingStart, HearingMessageCreate
from personas.archetypes import get_archetype
from prompts.system_prompts import generate_hearing_message

router = APIRouter()


def _build_case_context(case: Case, parties: list) -> dict:
    """Build the context dict for the hearing prompt."""
    plaintiff_name = "Plaintiff"
    defendant_name = "Defendant"
    for p in parties:
        if p.role == PartyRole.PLAINTIFF:
            plaintiff_name = p.name
        elif p.role == PartyRole.DEFENDANT:
            defendant_name = p.name

    return {
        "case_type": case.case_type.value if case.case_type else "unknown",
        "plaintiff_name": plaintiff_name,
        "defendant_name": defendant_name,
        "plaintiff_narrative": case.plaintiff_narrative or "",
        "defendant_narrative": case.defendant_narrative or "",
        "claimed_amount": float(case.claimed_amount) if case.claimed_amount else 0,
    }


@router.post("/cases/{case_id}/hearing", response_model=HearingResponse)
async def start_hearing(
    case_id: uuid.UUID,
    body: HearingStart,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Start a hearing simulation for a case."""
    # Load case with parties
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
    case_context = _build_case_context(case, case.parties)
    opening = await generate_hearing_message(
        archetype_id=body.archetype_id,
        case_context=case_context,
        conversation_history=[],
    )

    # Save opening message
    msg = HearingMessage(
        hearing_id=hearing.id,
        role=HearingMessageRole.JUDGE,
        content=opening["content"],
        sequence=1,
    )
    db.add(msg)
    await db.flush()

    # Update case status
    case.status = CaseStatus.HEARING
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
        await websocket.close(code=4401 if exc.status_code == 401 else 1008, reason=exc.detail)
        return

    await websocket.accept()

    # ── Initial load: fetch hearing + case context, then release connection ──
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
            case_context = _build_case_context(case, case.parties)

            existing_messages = [
                {"role": msg.role.value, "content": msg.content, "sequence": msg.sequence}
                for msg in sorted(hearing.messages, key=lambda m: m.sequence)
            ]

        # Send existing messages (connection already released)
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

    # ── Message loop: acquire a fresh DB session per exchange ────────────
    try:
        while True:
            data = await websocket.receive_json()
            role_str = data.get("role", "plaintiff")
            content = data.get("content", "")

            if not content:
                continue

            try:
                role_enum = HearingMessageRole(role_str)
                if role_enum == HearingMessageRole.JUDGE:
                    await websocket.send_json({"error": "Cannot send messages as judge"})
                    continue
            except ValueError:
                await websocket.send_json({"error": f"Invalid role: {role_str}"})
                continue

            # Short-lived DB session for this message exchange
            async with AsyncSessionLocal() as db:
                try:
                    seq_result = await db.execute(
                        select(func.max(HearingMessage.sequence))
                        .where(HearingMessage.hearing_id == hearing_id)
                    )
                    max_seq = seq_result.scalar() or 0

                    user_msg = HearingMessage(
                        hearing_id=hearing_id,
                        role=role_enum,
                        content=content,
                        sequence=max_seq + 1,
                    )
                    db.add(user_msg)
                    await db.flush()

                    msgs_result = await db.execute(
                        select(HearingMessage)
                        .where(HearingMessage.hearing_id == hearing_id)
                        .order_by(HearingMessage.sequence)
                    )
                    history = [
                        {"role": m.role.value, "content": m.content}
                        for m in msgs_result.scalars().all()
                    ]

                    # LLM call happens while we still hold the session (need to
                    # save the judge message in the same transaction)
                    judge_response = await generate_hearing_message(
                        archetype_id=archetype_id,
                        case_context=case_context,
                        conversation_history=history,
                    )

                    judge_msg = HearingMessage(
                        hearing_id=hearing_id,
                        role=HearingMessageRole.JUDGE,
                        content=judge_response["content"],
                        sequence=max_seq + 2,
                    )
                    db.add(judge_msg)

                    concluded = "hearing is now concluded" in judge_response["content"].lower()
                    if concluded:
                        hearing_obj = await db.get(Hearing, hearing_id)
                        if hearing_obj:
                            hearing_obj.completed_at = func.now()

                    await db.commit()
                except Exception:
                    await db.rollback()
                    raise

            # Send response after DB session is released
            await websocket.send_json({
                "role": HearingMessageRole.JUDGE.value,
                "content": judge_response["content"],
                "sequence": max_seq + 2,
            })

            if concluded:
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

    # Load hearing
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

    # Load case
    case_result = await db.execute(
        select(Case)
        .where(Case.id == case_id)
        .options(selectinload(Case.parties))
    )
    case = case_result.scalar_one()
    case_context = _build_case_context(case, case.parties)

    # Get next sequence
    max_seq = max((m.sequence for m in hearing.messages), default=0)

    # Save user message (convert PartyRole to HearingMessageRole)
    user_msg = HearingMessage(
        hearing_id=hearing.id,
        role=HearingMessageRole(body.role.value),
        content=body.content,
        sequence=max_seq + 1,
    )
    db.add(user_msg)
    await db.flush()

    # Build conversation history
    history = [
        {"role": m.role.value, "content": m.content}
        for m in sorted(hearing.messages, key=lambda m: m.sequence)
    ]
    history.append({"role": body.role.value, "content": body.content})

    # Generate judge response
    judge_response = await generate_hearing_message(
        archetype_id=hearing.archetype_id,
        case_context=case_context,
        conversation_history=history,
    )

    judge_msg = HearingMessage(
        hearing_id=hearing.id,
        role=HearingMessageRole.JUDGE,
        content=judge_response["content"],
        sequence=max_seq + 2,
    )
    db.add(judge_msg)
    await db.flush()

    concluded = "hearing is now concluded" in judge_response["content"].lower()
    if concluded:
        from sqlalchemy import func as sqlfunc
        hearing.completed_at = sqlfunc.now()
        await db.flush()

    return {
        "judge_message": {
            "role": HearingMessageRole.JUDGE.value,
            "content": judge_response["content"],
            "sequence": max_seq + 2,
        },
        "hearing_concluded": concluded,
    }
