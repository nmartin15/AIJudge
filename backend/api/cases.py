"""Case management API endpoints."""

import uuid

import fastapi
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from fastapi.responses import Response as RawResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.guardrails import api_error
from db.connection import get_db
from api.security import (
    apply_admin_claim,
    get_or_create_session,
    get_owned_case,
    optional_admin_key_header,
    optional_session_id,
    required_session_header,
    set_session_cookie,
)
from models.database import (
    Case,
    Evidence,
    EvidenceType,
    Party,
    PartyRole,
    Session,
    TimelineEvent,
)
from models.schemas import (
    CaseCreate,
    CaseResponse,
    CaseUpdate,
    EvidenceResponse,
    PartyCreate,
    PartyResponse,
    SessionResponse,
    TimelineEventCreate,
    TimelineEventResponse,
)
from services import file_service

router = APIRouter()


# ─── Session Endpoints ────────────────────────────────────────────────────────


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    response: fastapi.Response,
    admin_key: str | None = Depends(optional_admin_key_header),
    db: AsyncSession = Depends(get_db),
):
    """Create an anonymous session for case ownership."""
    session = Session()
    apply_admin_claim(session, admin_key)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    set_session_cookie(response, str(session.id))
    return session


# ─── Case CRUD ────────────────────────────────────────────────────────────────


@router.post("/cases", response_model=CaseResponse)
async def create_case(
    body: CaseCreate,
    session_id: str | None = Depends(optional_session_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new case. If no session_id provided, creates a new session."""
    session = await get_or_create_session(db, session_id)

    case = Case(
        session_id=session.id,
        case_type=body.case_type,
        plaintiff_narrative=body.plaintiff_narrative,
        defendant_narrative=body.defendant_narrative,
        claimed_amount=body.claimed_amount,
        damages_breakdown=body.damages_breakdown,
    )
    db.add(case)
    await db.flush()

    # Re-query with relationships loaded
    result = await db.execute(
        select(Case)
        .where(Case.id == case.id)
        .options(
            selectinload(Case.parties),
            selectinload(Case.evidence),
            selectinload(Case.timeline_events),
        )
    )
    case = result.scalar_one()
    return case


@router.get("/cases/{case_id}", response_model=CaseResponse)
async def get_case(
    case_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Get a case by ID with all related data."""
    case = await get_owned_case(
        db,
        case_id,
        session_id,
        options=(
            selectinload(Case.parties),
            selectinload(Case.evidence),
            selectinload(Case.timeline_events),
        ),
    )
    return case


@router.put("/cases/{case_id}", response_model=CaseResponse)
async def update_case(
    case_id: uuid.UUID,
    body: CaseUpdate,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Update case details."""
    case = await get_owned_case(db, case_id, session_id)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(case, field, value)

    await db.flush()

    # Expire the instance and reload with all relationships in a single query
    await db.refresh(case)
    result = await db.execute(
        select(Case)
        .where(Case.id == case_id)
        .options(
            selectinload(Case.parties),
            selectinload(Case.evidence),
            selectinload(Case.timeline_events),
        )
    )
    return result.scalar_one()


# ─── Party Endpoints ──────────────────────────────────────────────────────────


@router.post("/cases/{case_id}/parties", response_model=PartyResponse)
async def add_party(
    case_id: uuid.UUID,
    body: PartyCreate,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Add a party (plaintiff or defendant) to a case."""
    await get_owned_case(db, case_id, session_id)

    # Check if party with this role already exists
    existing = await db.execute(
        select(Party).where(Party.case_id == case_id, Party.role == body.role)
    )
    if existing.scalar_one_or_none():
        raise api_error(
            status_code=409,
            code="party_exists",
            message=f"{body.role.value} already exists for this case",
        )

    party = Party(case_id=case_id, **body.model_dump())
    db.add(party)
    await db.flush()
    await db.refresh(party)
    return party


# ─── Evidence Endpoints ───────────────────────────────────────────────────────


@router.post("/cases/{case_id}/evidence", response_model=EvidenceResponse)
async def add_evidence(
    case_id: uuid.UUID,
    submitted_by: str = Form(...),
    evidence_type: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile | None = File(None),
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Add evidence to a case, optionally with a file upload."""
    await get_owned_case(db, case_id, session_id)

    file_path = None
    if file:
        file_path = await file_service.save_upload(file, case_id)

    evidence = Evidence(
        case_id=case_id,
        submitted_by=PartyRole(submitted_by),
        evidence_type=EvidenceType(evidence_type),
        title=title,
        description=description or None,
        file_path=file_path,
    )
    db.add(evidence)
    await db.flush()
    await db.refresh(evidence)
    return EvidenceResponse.from_evidence(evidence)


@router.get("/cases/{case_id}/evidence/{evidence_id}/download")
async def download_evidence_file(
    case_id: uuid.UUID,
    evidence_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Securely download an evidence file (ownership-checked)."""
    await get_owned_case(db, case_id, session_id)

    result = await db.execute(
        select(Evidence).where(Evidence.id == evidence_id, Evidence.case_id == case_id)
    )
    evidence = result.scalar_one_or_none()
    if not evidence or not evidence.file_path:
        raise api_error(
            status_code=404,
            code="evidence_file_not_found",
            message="Evidence file not found",
        )

    plaintext = file_service.read_and_decrypt(evidence.file_path)
    filename = file_service.safe_filename(evidence.file_path)

    return RawResponse(
        content=plaintext,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ─── Timeline Endpoints ───────────────────────────────────────────────────────


@router.post("/cases/{case_id}/timeline", response_model=TimelineEventResponse)
async def add_timeline_event(
    case_id: uuid.UUID,
    body: TimelineEventCreate,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Add a timeline event to a case."""
    await get_owned_case(db, case_id, session_id)

    event = TimelineEvent(case_id=case_id, **body.model_dump())
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


@router.get("/cases/{case_id}/timeline", response_model=list[TimelineEventResponse])
async def get_timeline(
    case_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500, description="Max events to return"),
    offset: int = Query(0, ge=0, description="Number of events to skip"),
):
    """Get all timeline events for a case, ordered by date."""
    await get_owned_case(db, case_id, session_id)
    result = await db.execute(
        select(TimelineEvent)
        .where(TimelineEvent.case_id == case_id)
        .order_by(TimelineEvent.event_date)
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()
