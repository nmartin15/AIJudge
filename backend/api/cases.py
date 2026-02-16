"""Case management API endpoints."""

import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import get_settings
from db.connection import get_db
from api.security import (
    apply_admin_claim,
    get_or_create_session,
    get_owned_case,
    optional_admin_key_header,
    optional_session_header,
    required_session_header,
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
    CaseSummary,
    CaseUpdate,
    EvidenceCreate,
    EvidenceResponse,
    PartyCreate,
    PartyResponse,
    SessionCreate,
    SessionResponse,
    TimelineEventCreate,
    TimelineEventResponse,
)

settings = get_settings()
router = APIRouter()
MAX_UPLOAD_SIZE_BYTES = settings.max_upload_size_mb * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".txt",
    ".csv",
    ".doc",
    ".docx",
    ".eml",
    ".msg",
}


# ─── Session Endpoints ────────────────────────────────────────────────────────


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    admin_key: str | None = Depends(optional_admin_key_header),
    db: AsyncSession = Depends(get_db),
):
    """Create an anonymous session for case ownership."""
    session = Session()
    apply_admin_claim(session, admin_key)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


# ─── Case CRUD ────────────────────────────────────────────────────────────────


@router.post("/cases", response_model=CaseResponse)
async def create_case(
    body: CaseCreate,
    session_id: str | None = Depends(optional_session_header),
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
        raise HTTPException(
            status_code=409,
            detail=f"{body.role.value} already exists for this case",
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
        upload_dir = os.path.join(settings.upload_dir, str(case_id))
        os.makedirs(upload_dir, exist_ok=True)

        original_name = Path(file.filename or "").name
        sanitized_name = re.sub(r"[^A-Za-z0-9._-]", "_", original_name).strip("._")
        if not sanitized_name:
            raise HTTPException(status_code=400, detail="Invalid filename")

        extension = Path(sanitized_name).suffix.lower()
        if extension not in ALLOWED_UPLOAD_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        file_path = os.path.join(upload_dir, f"{uuid.uuid4()}_{sanitized_name}")
        total_size = 0
        try:
            with open(file_path, "wb") as f:
                while chunk := await file.read(64 * 1024):  # 64 KB chunks
                    total_size += len(chunk)
                    if total_size > MAX_UPLOAD_SIZE_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"File too large. Max size is {settings.max_upload_size_mb}MB",
                        )
                    f.write(chunk)
        except HTTPException:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise

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
    return evidence


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
