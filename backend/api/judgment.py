"""Judgment generation and retrieval API endpoints."""

import asyncio
import hashlib
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sqlfunc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from api.guardrails import FixedWindowRateLimiter, api_error
from api.security import get_owned_case, required_session_header
from config import get_settings
from db.connection import get_db
from engine.case_advisor import synthesize_comparison_insights
from engine.pipeline import run_pipeline
from models.database import (
    Case,
    CaseStatus,
    CaseType,
    ComparisonResult,
    ComparisonRun,
    Hearing,
    Judgment,
    LLMCall,
    PartyRole,
)
from models.schemas import (
    ComparisonRunRequest,
    ComparisonRunResponse,
    JudgmentRequest,
    JudgmentResponse,
)

router = APIRouter()
settings = get_settings()
judgment_limiter = FixedWindowRateLimiter(
    max_requests=settings.judgment_requests_per_minute,
    window_seconds=60,
)


def _extract_party_names(case: Case) -> tuple[str, str]:
    plaintiff_name = "Plaintiff"
    defendant_name = "Defendant"
    for party in case.parties:
        if party.role == PartyRole.PLAINTIFF:
            plaintiff_name = party.name
        elif party.role == PartyRole.DEFENDANT:
            defendant_name = party.name
    return plaintiff_name, defendant_name


def _extract_hearing_transcript(hearing: Hearing | None) -> list[dict] | None:
    if not hearing or not hearing.messages:
        return None
    return [
        {"role": message.role.value, "content": message.content}
        for message in sorted(hearing.messages, key=lambda item: item.sequence)
    ]


def _derive_winner(value: str | None) -> PartyRole:
    winner = (value or "defendant").lower()
    return PartyRole.PLAINTIFF if "plaintiff" in winner else PartyRole.DEFENDANT


def _comparison_run_key(
    case: Case,
    hearing: Hearing | None,
    archetype_ids: list[str],
) -> str:
    key_payload = {
        "case_id": str(case.id),
        "archetype_ids": sorted(archetype_ids),
        "plaintiff_narrative": case.plaintiff_narrative,
        "defendant_narrative": case.defendant_narrative,
        "claimed_amount": float(case.claimed_amount) if case.claimed_amount is not None else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
        "hearing_completed_at": hearing.completed_at.isoformat() if hearing and hearing.completed_at else None,
        "hearing_message_count": len(hearing.messages) if hearing and hearing.messages else 0,
    }
    serialized = json.dumps(key_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


async def _get_case_and_hearing_context(
    db: AsyncSession,
    case_id: uuid.UUID,
    session_id: str,
) -> tuple[Case, Hearing | None]:
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
    hearing_result = await db.execute(
        select(Hearing)
        .where(Hearing.case_id == case_id)
        .options(selectinload(Hearing.messages))
    )
    hearing = hearing_result.scalar_one_or_none()
    return case, hearing


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
    case, hearing = await _get_case_and_hearing_context(db, case_id, session_id)

    if not case.plaintiff_narrative or not case.defendant_narrative:
        raise api_error(
            status_code=400,
            code="judgment_missing_narratives",
            message="Both plaintiff and defendant narratives are required.",
        )

    # Check if judgment already exists
    existing = await db.execute(
        select(Judgment).where(Judgment.case_id == case_id)
    )
    if existing.scalar_one_or_none():
        raise api_error(
            status_code=409,
            code="judgment_exists",
            message="Judgment already exists for this case.",
        )

    plaintiff_name, defendant_name = _extract_party_names(case)
    hearing_transcript = _extract_hearing_transcript(hearing)

    # Run the pipeline
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

    # Extract judgment data
    judgment_data = pipeline_result["judgment"]
    in_favor_of = _derive_winner(judgment_data.get("in_favor_of"))

    # Save judgment
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

    # Save LLM call records
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

    # Update case status
    case.status = CaseStatus.DECIDED
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

    # Aggregate totals via SQL (always covers every call)
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

    # Paginated individual call records
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


@router.post("/cases/{case_id}/comparison-runs", response_model=ComparisonRunResponse)
async def run_or_reuse_comparison(
    case_id: uuid.UUID,
    body: ComparisonRunRequest,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Run and persist multi-judge comparison results, reusing matching runs."""
    await judgment_limiter.check(
        key=session_id,
        code="comparison_rate_limited",
        message="Comparison rate limit exceeded. Please retry shortly.",
    )
    case, hearing = await _get_case_and_hearing_context(db, case_id, session_id)
    if not case.plaintiff_narrative or not case.defendant_narrative:
        raise api_error(
            status_code=400,
            code="comparison_missing_narratives",
            message="Both plaintiff and defendant narratives are required.",
        )

    archetype_ids = sorted({value.strip() for value in body.archetype_ids if value.strip()})
    if not archetype_ids:
        raise api_error(
            status_code=400,
            code="comparison_archetypes_required",
            message="At least one valid archetype_id is required.",
        )

    run_key = _comparison_run_key(case, hearing, archetype_ids)
    existing_stmt = (
        select(ComparisonRun)
        .where(ComparisonRun.case_id == case_id, ComparisonRun.run_key == run_key)
        .options(selectinload(ComparisonRun.results))
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing and not body.force_refresh:
        cached_insights_input = [
            {
                "archetype_id": r.archetype_id,
                "in_favor_of": r.in_favor_of.value if r.in_favor_of else "unknown",
                "awarded_amount": float(r.awarded_amount) if r.awarded_amount else 0,
                "evidence_scores": r.evidence_scores or {},
                "reasoning_chain": r.reasoning_chain or {},
            }
            for r in existing.results
        ]
        return ComparisonRunResponse.model_validate(
            {
                "id": existing.id,
                "case_id": existing.case_id,
                "archetype_ids": existing.archetype_ids,
                "created_at": existing.created_at,
                "results": existing.results,
                "reused": True,
                "comparison_insights": synthesize_comparison_insights(cached_insights_input),
            }
        )
    if existing and body.force_refresh:
        await db.delete(existing)
        await db.flush()

    plaintiff_name, defendant_name = _extract_party_names(case)
    hearing_transcript = _extract_hearing_transcript(hearing)
    comparison_run = ComparisonRun(
        case_id=case_id,
        run_key=run_key,
        archetype_ids=archetype_ids,
    )
    db.add(comparison_run)
    await db.flush()

    # Run all archetype pipelines concurrently (capped at 4 to respect LLM
    # rate limits).  Each pipeline is independent: same case data, different
    # judge archetype.
    sem = asyncio.Semaphore(4)
    claimed = float(case.claimed_amount) if case.claimed_amount is not None else None

    async def _run_one(arch_id: str) -> dict:
        async with sem:
            return await run_pipeline(
                db=db,
                plaintiff_narrative=case.plaintiff_narrative,
                defendant_narrative=case.defendant_narrative,
                plaintiff_name=plaintiff_name,
                defendant_name=defendant_name,
                claimed_amount=claimed,
                archetype_id=arch_id,
                hearing_transcript=hearing_transcript,
            )

    pipeline_results = await asyncio.gather(
        *(_run_one(aid) for aid in archetype_ids),
        return_exceptions=True,
    )

    for archetype_id, pipeline_result in zip(archetype_ids, pipeline_results):
        if isinstance(pipeline_result, BaseException):
            logger.error(
                "Pipeline failed for archetype %s on case %s: %s",
                archetype_id, case_id, pipeline_result,
            )
            continue

        judgment_data = pipeline_result["judgment"]
        result = ComparisonResult(
            run_id=comparison_run.id,
            archetype_id=archetype_id,
            findings_of_fact=judgment_data.get("findings_of_fact", []),
            conclusions_of_law=judgment_data.get("conclusions_of_law", []),
            judgment_text=judgment_data.get("judgment_text", ""),
            rationale=judgment_data.get("rationale", ""),
            awarded_amount=judgment_data.get("awarded_amount"),
            in_favor_of=_derive_winner(judgment_data.get("in_favor_of")),
            evidence_scores=pipeline_result.get("evidence_scores"),
            reasoning_chain=pipeline_result.get("reasoning_chain"),
            metadata_={
                "pipeline_metadata": pipeline_result.get("pipeline_metadata"),
                "classification": pipeline_result.get("classification"),
                "advisory": pipeline_result.get("advisory"),
            },
        )
        db.add(result)

        for call_meta in pipeline_result.get("pipeline_metadata", {}).get("llm_calls", []):
            pipeline_step = f"cmp:{archetype_id}:{call_meta['pipeline_step']}"[:50]
            llm_call = LLMCall(
                case_id=case_id,
                pipeline_step=pipeline_step,
                model=call_meta["model"],
                input_tokens=call_meta["input_tokens"],
                output_tokens=call_meta["output_tokens"],
                cost_usd=call_meta["cost_usd"],
                latency_ms=call_meta["latency_ms"],
            )
            db.add(llm_call)

    await db.flush()
    run_with_results = (
        await db.execute(
            select(ComparisonRun)
            .where(ComparisonRun.id == comparison_run.id)
            .options(selectinload(ComparisonRun.results))
        )
    ).scalar_one()

    # Synthesize comparison insights across all judge results
    insights_input = [
        {
            "archetype_id": r.archetype_id,
            "in_favor_of": r.in_favor_of.value if r.in_favor_of else "unknown",
            "awarded_amount": float(r.awarded_amount) if r.awarded_amount else 0,
            "evidence_scores": r.evidence_scores or {},
            "reasoning_chain": r.reasoning_chain or {},
        }
        for r in run_with_results.results
    ]
    insights = synthesize_comparison_insights(insights_input)

    return ComparisonRunResponse.model_validate(
        {
            "id": run_with_results.id,
            "case_id": run_with_results.case_id,
            "archetype_ids": run_with_results.archetype_ids,
            "created_at": run_with_results.created_at,
            "results": run_with_results.results,
            "reused": False,
            "comparison_insights": insights,
        }
    )


@router.get("/cases/{case_id}/comparison-runs", response_model=list[ComparisonRunResponse])
async def list_comparison_runs(
    case_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100, description="Max runs to return"),
    offset: int = Query(0, ge=0, description="Number of runs to skip"),
):
    """List persisted comparison runs for a case (newest first)."""
    await get_owned_case(db, case_id, session_id)
    runs = (
        await db.execute(
            select(ComparisonRun)
            .where(ComparisonRun.case_id == case_id)
            .options(selectinload(ComparisonRun.results))
            .order_by(ComparisonRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    return [
        ComparisonRunResponse.model_validate(
            {
                "id": run.id,
                "case_id": run.case_id,
                "archetype_ids": run.archetype_ids,
                "created_at": run.created_at,
                "results": run.results,
                "reused": False,
            }
        )
        for run in runs
    ]


@router.get("/cases/{case_id}/comparison-runs/{run_id}", response_model=ComparisonRunResponse)
async def get_comparison_run(
    case_id: uuid.UUID,
    run_id: uuid.UUID,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Fetch a persisted comparison run by ID."""
    await get_owned_case(db, case_id, session_id)
    run = (
        await db.execute(
            select(ComparisonRun)
            .where(ComparisonRun.id == run_id, ComparisonRun.case_id == case_id)
            .options(selectinload(ComparisonRun.results))
        )
    ).scalar_one_or_none()
    if not run:
        raise api_error(
            status_code=404,
            code="comparison_run_not_found",
            message="Comparison run not found for this case.",
        )
    return ComparisonRunResponse.model_validate(
        {
            "id": run.id,
            "case_id": run.case_id,
            "archetype_ids": run.archetype_ids,
            "created_at": run.created_at,
            "results": run.results,
            "reused": False,
        }
    )
