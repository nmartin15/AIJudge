"""Multi-judge comparison run endpoints."""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.guardrails import FixedWindowRateLimiter, api_error
from api.security import get_owned_case, required_session_header
from config import get_settings
from db.connection import get_db
from engine.case_advisor import synthesize_comparison_insights
from engine.pipeline import run_pipeline
from models.database import (
    Case,
    ComparisonResult,
    ComparisonRun,
    LLMCall,
)
from models.schemas import ComparisonRunRequest, ComparisonRunResponse
from services.hearing_service import extract_party_names
from services.judgment_helpers import (
    comparison_run_key,
    derive_winner,
    extract_hearing_transcript,
    get_case_and_hearing_context,
)

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()
comparison_limiter = FixedWindowRateLimiter(
    max_requests=settings.judgment_requests_per_minute,
    window_seconds=60,
)


@router.post("/cases/{case_id}/comparison-runs", response_model=ComparisonRunResponse)
async def run_or_reuse_comparison(
    case_id: uuid.UUID,
    body: ComparisonRunRequest,
    session_id: str = Depends(required_session_header),
    db: AsyncSession = Depends(get_db),
):
    """Run and persist multi-judge comparison results, reusing matching runs."""
    await comparison_limiter.check(
        key=session_id,
        code="comparison_rate_limited",
        message="Comparison rate limit exceeded. Please retry shortly.",
    )
    case, hearing = await get_case_and_hearing_context(db, case_id, session_id)
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

    run_key = comparison_run_key(case, hearing, archetype_ids)
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

    plaintiff_name, defendant_name = extract_party_names(case)
    hearing_transcript = extract_hearing_transcript(hearing)
    comp_run = ComparisonRun(
        case_id=case_id,
        run_key=run_key,
        archetype_ids=archetype_ids,
    )
    db.add(comp_run)
    await db.flush()

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
            run_id=comp_run.id,
            archetype_id=archetype_id,
            findings_of_fact=judgment_data.get("findings_of_fact", []),
            conclusions_of_law=judgment_data.get("conclusions_of_law", []),
            judgment_text=judgment_data.get("judgment_text", ""),
            rationale=judgment_data.get("rationale", ""),
            awarded_amount=judgment_data.get("awarded_amount"),
            in_favor_of=derive_winner(judgment_data.get("in_favor_of")),
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
            .where(ComparisonRun.id == comp_run.id)
            .options(selectinload(ComparisonRun.results))
        )
    ).scalar_one()

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
