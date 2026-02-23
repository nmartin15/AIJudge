"""Judgment generation, retrieval, and metadata endpoints."""

import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sqlfunc, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.guardrails import FixedWindowRateLimiter, api_error
from api.security import get_owned_case, required_session_header
from config import get_settings
from db.connection import get_db
from engine.pipeline import run_pipeline
from models.database import (
    Case,
    CaseStatus,
    CaseType,
    Judgment,
    LLMCall,
)
from models.schemas import JudgmentRequest, JudgmentResponse
from services.hearing_service import extract_party_names
from services.judgment_helpers import (
    derive_winner,
    extract_hearing_transcript,
    get_case_and_hearing_context,
)

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()
judgment_limiter = FixedWindowRateLimiter(
    max_requests=settings.judgment_requests_per_minute,
    window_seconds=60,
)


@router.post("/cases/{case_id}/judgment", response_model=JudgmentResponse)
async def generate_judgment(
    case_id: uuid.UUID,
    body: JudgmentRequest,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """
    Run the full judicial reasoning pipeline and generate a judgment.

    Requires: plaintiff and defendant narratives + at least the case type.
    """
    await judgment_limiter.check(
        key=session_id,
        code="judgment_rate_limited",
        message="Judgment generation rate limit exceeded. Please retry shortly.",
    )
    case, hearing = await get_case_and_hearing_context(db, case_id, session_id)

    if not case.plaintiff_narrative or not case.defendant_narrative:
        raise api_error(
            status_code=400,
            code="judgment_missing_narratives",
            message="Both plaintiff and defendant narratives are required.",
        )

    existing = await db.execute(
        select(Judgment).where(Judgment.case_id == case_id)
    )
    if existing.scalar_one_or_none():
        raise api_error(
            status_code=409,
            code="judgment_exists",
            message="Judgment already exists for this case.",
        )

    plaintiff_name, defendant_name = extract_party_names(case)
    hearing_transcript = extract_hearing_transcript(hearing)

    pipeline_result = await run_pipeline(
        db=db,
        plaintiff_narrative=case.plaintiff_narrative,
        defendant_narrative=case.defendant_narrative,
        plaintiff_name=plaintiff_name,
        defendant_name=defendant_name,
        claimed_amount=float(case.claimed_amount) if case.claimed_amount is not None else None,
        archetype_id=body.archetype_id,
        hearing_transcript=hearing_transcript,
    )

    judgment_data = pipeline_result["judgment"]
    in_favor_of = derive_winner(judgment_data.get("in_favor_of"))

    judgment = Judgment(
        case_id=case_id,
        archetype_id=body.archetype_id,
        findings_of_fact=judgment_data.get("findings_of_fact", []),
        conclusions_of_law=judgment_data.get("conclusions_of_law", []),
        judgment_text=judgment_data.get("judgment_text", ""),
        rationale=judgment_data.get("rationale", ""),
        awarded_amount=judgment_data.get("awarded_amount"),
        in_favor_of=in_favor_of,
        evidence_scores=pipeline_result.get("evidence_scores"),
        reasoning_chain=pipeline_result.get("reasoning_chain"),
        advisory=pipeline_result.get("advisory"),
    )
    db.add(judgment)

    for call_meta in pipeline_result["pipeline_metadata"]["llm_calls"]:
        llm_call = LLMCall(
            case_id=case_id,
            pipeline_step=call_meta["pipeline_step"],
            model=call_meta["model"],
            input_tokens=call_meta["input_tokens"],
            output_tokens=call_meta["output_tokens"],
            cost_usd=call_meta["cost_usd"],
            latency_ms=call_meta["latency_ms"],
        )
        db.add(llm_call)

    case.status = CaseStatus.decided
    case.archetype_id = body.archetype_id
    if not case.case_type and pipeline_result.get("classification", {}).get("primary_type"):
        try:
            case.case_type = CaseType(pipeline_result["classification"]["primary_type"])
            case.case_type_confidence = pipeline_result["classification"].get("primary_confidence")
        except ValueError:
            pass

    await db.flush()
    await db.refresh(judgment)
    return judgment


@router.get("/cases/{case_id}/judgment", response_model=JudgmentResponse)
async def get_judgment(
    case_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the judgment for a case."""
    await get_owned_case(db, case_id, session_id)
    result = await db.execute(
        select(Judgment).where(Judgment.case_id == case_id)
    )
    judgment = result.scalar_one_or_none()
    if not judgment:
        raise api_error(
            status_code=404,
            code="judgment_not_found",
            message="No judgment found for this case.",
        )
    return judgment


@router.get("/cases/{case_id}/judgment/metadata")
async def get_judgment_metadata(
    case_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500, description="Max call records to return"),
    offset: int = Query(0, ge=0, description="Number of call records to skip"),
):
    """Get pipeline metadata (cost, latency) for a judgment.

    Totals always reflect **all** LLM calls for the case regardless of
    limit/offset; the ``calls`` list is paginated.
    """
    await get_owned_case(db, case_id, session_id)

    totals_result = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(LLMCall.cost_usd), 0),
            sqlfunc.coalesce(sqlfunc.sum(LLMCall.latency_ms), 0),
            sqlfunc.coalesce(sqlfunc.sum(LLMCall.input_tokens), 0),
            sqlfunc.coalesce(sqlfunc.sum(LLMCall.output_tokens), 0),
            sqlfunc.count(LLMCall.id),
        ).where(LLMCall.case_id == case_id)
    )
    total_cost, total_latency, total_input, total_output, total_count = totals_result.one()

    if total_count == 0:
        raise api_error(
            status_code=404,
            code="judgment_metadata_not_found",
            message="No LLM call records found for this case.",
        )

    calls_result = await db.execute(
        select(LLMCall)
        .where(LLMCall.case_id == case_id)
        .order_by(LLMCall.created_at)
        .limit(limit)
        .offset(offset)
    )
    calls = calls_result.scalars().all()

    return {
        "total_cost_usd": float(round(total_cost, 6)),
        "total_latency_ms": int(total_latency),
        "total_input_tokens": int(total_input),
        "total_output_tokens": int(total_output),
        "total_calls": int(total_count),
        "calls": [
            {
                "step": c.pipeline_step,
                "model": c.model,
                "input_tokens": c.input_tokens,
                "output_tokens": c.output_tokens,
                "cost_usd": float(round(c.cost_usd, 6)),
                "latency_ms": c.latency_ms,
            }
            for c in calls
        ],
    }
