"""Pydantic schemas for API request/response validation."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from models.database import (
    CaseStatus,
    CaseType,
    EvidenceType,
    HearingMessageRole,
    OperatorRole,
    PartyRole,
)


# ─── Session ──────────────────────────────────────────────────────────────────


class SessionCreate(BaseModel):
    pass


class SessionResponse(BaseModel):
    id: UUID
    role: OperatorRole
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthMeResponse(BaseModel):
    session_id: UUID
    role: OperatorRole
    is_admin: bool


class AdminLoginRequest(BaseModel):
    admin_key: str = Field(..., min_length=1)


# ─── Party ────────────────────────────────────────────────────────────────────


class PartyCreate(BaseModel):
    role: PartyRole
    name: str = Field(..., min_length=1, max_length=255)
    address: str | None = None
    phone: str | None = None


class PartyResponse(BaseModel):
    id: UUID
    case_id: UUID
    role: PartyRole
    name: str
    address: str | None
    phone: str | None

    model_config = {"from_attributes": True}


# ─── Evidence ─────────────────────────────────────────────────────────────────


class EvidenceCreate(BaseModel):
    submitted_by: PartyRole
    evidence_type: EvidenceType
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class EvidenceResponse(BaseModel):
    id: UUID
    case_id: UUID
    submitted_by: PartyRole
    evidence_type: EvidenceType
    title: str
    description: str | None
    file_path: str | None
    score: int | None
    score_explanation: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Timeline ─────────────────────────────────────────────────────────────────


class TimelineEventCreate(BaseModel):
    event_date: datetime
    description: str = Field(..., min_length=1)
    source: PartyRole | None = None
    disputed: bool = False


class TimelineEventResponse(BaseModel):
    id: UUID
    case_id: UUID
    event_date: datetime
    description: str
    source: PartyRole | None
    disputed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Case ─────────────────────────────────────────────────────────────────────


class CaseCreate(BaseModel):
    case_type: CaseType | None = None
    plaintiff_narrative: str | None = None
    defendant_narrative: str | None = None
    claimed_amount: Decimal | None = Field(None, ge=0, le=6000)
    damages_breakdown: dict | None = None


class CaseUpdate(BaseModel):
    case_type: CaseType | None = None
    plaintiff_narrative: str | None = None
    defendant_narrative: str | None = None
    claimed_amount: Decimal | None = Field(None, ge=0, le=6000)
    damages_breakdown: dict | None = None
    archetype_id: str | None = None


class CaseResponse(BaseModel):
    id: UUID
    session_id: UUID
    status: CaseStatus
    case_type: CaseType | None
    case_type_confidence: float | None
    plaintiff_narrative: str | None
    defendant_narrative: str | None
    claimed_amount: Decimal | None
    damages_breakdown: dict | None
    archetype_id: str | None
    created_at: datetime
    updated_at: datetime
    parties: list[PartyResponse] = []
    evidence: list[EvidenceResponse] = []
    timeline_events: list[TimelineEventResponse] = []

    model_config = {"from_attributes": True}


class CaseSummary(BaseModel):
    """Lightweight case listing without nested relations."""

    id: UUID
    status: CaseStatus
    case_type: CaseType | None
    claimed_amount: Decimal | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Hearing ──────────────────────────────────────────────────────────────────


class HearingMessageCreate(BaseModel):
    role: PartyRole  # users can only speak as plaintiff or defendant
    content: str = Field(..., min_length=1)


class HearingMessageResponse(BaseModel):
    id: UUID
    hearing_id: UUID
    role: HearingMessageRole
    content: str
    sequence: int
    created_at: datetime

    model_config = {"from_attributes": True}


class HearingResponse(BaseModel):
    id: UUID
    case_id: UUID
    archetype_id: str
    started_at: datetime
    completed_at: datetime | None
    messages: list[HearingMessageResponse] = []

    model_config = {"from_attributes": True}


class HearingStart(BaseModel):
    archetype_id: str = Field(..., min_length=1)


# ─── Judgment ─────────────────────────────────────────────────────────────────


class JudgmentRequest(BaseModel):
    archetype_id: str = Field(..., min_length=1)


class JudgmentResponse(BaseModel):
    id: UUID
    case_id: UUID
    archetype_id: str
    findings_of_fact: list[str]
    conclusions_of_law: list[dict]
    judgment_text: str
    rationale: str
    awarded_amount: Decimal | None
    in_favor_of: PartyRole
    evidence_scores: dict | None
    reasoning_chain: dict | None
    advisory: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ComparisonRunRequest(BaseModel):
    archetype_ids: list[str] = Field(..., min_length=1, max_length=8)
    force_refresh: bool = False


class ComparisonResultResponse(BaseModel):
    archetype_id: str
    findings_of_fact: list[str]
    conclusions_of_law: list[dict]
    judgment_text: str
    rationale: str
    awarded_amount: Decimal | None
    in_favor_of: PartyRole
    evidence_scores: dict | None
    reasoning_chain: dict | None
    metadata: dict | None = Field(default=None, alias="metadata_")
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class ComparisonRunResponse(BaseModel):
    id: UUID
    case_id: UUID
    archetype_ids: list[str]
    reused: bool = False
    created_at: datetime
    results: list[ComparisonResultResponse] = []
    comparison_insights: dict | None = None

    model_config = {"from_attributes": True}


# ─── Archetypes ───────────────────────────────────────────────────────────────


class ArchetypeResponse(BaseModel):
    id: str
    name: str
    description: str
    tone: str
    icon: str


# ─── Corpus ───────────────────────────────────────────────────────────────────


class CorpusSearchResult(BaseModel):
    source_type: str
    source_title: str
    section_number: str | None
    topic: str | None
    content: str
    similarity: float


class CorpusSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(5, ge=1, le=20)


# ─── Health ───────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
