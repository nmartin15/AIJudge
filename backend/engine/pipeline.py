"""
Judicial Reasoning Pipeline Orchestrator.

Runs the full 7-step pipeline: fact extraction → issue classification →
rule retrieval → evidence scoring → judicial reasoning → decision generation
+ case advisory.  Steps 6 & 7 run concurrently since neither depends on the
other.
"""

import asyncio
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from engine.case_advisor import generate_advisory
from engine.decision_generator import generate_decision
from engine.evidence_scorer import score_evidence
from engine.fact_extractor import extract_facts
from engine.issue_classifier import classify_issues
from engine.reasoning_engine import generate_reasoning
from engine.rule_engine import get_applicable_rules
from personas.archetypes import get_archetype


async def run_pipeline(
    db: AsyncSession,
    plaintiff_narrative: str,
    defendant_narrative: str,
    plaintiff_name: str = "Plaintiff",
    defendant_name: str = "Defendant",
    claimed_amount: float | None = None,
    archetype_id: str = "common_sense",
    hearing_transcript: list[dict] | None = None,
) -> dict:
    """
    Execute the full judicial reasoning pipeline.

    Steps 1-5 run sequentially (each depends on the previous).
    Steps 6 (decision) and 7 (advisory) run concurrently.

    Args:
        db: Database session for RAG retrieval
        plaintiff_narrative: Plaintiff's account of events
        defendant_narrative: Defendant's account of events
        plaintiff_name: Plaintiff's name
        defendant_name: Defendant's name
        claimed_amount: Dollar amount being claimed
        archetype_id: Which judge archetype to use
        hearing_transcript: Optional hearing messages

    Returns:
        Complete pipeline output with judgment and all intermediate results
    """
    archetype = get_archetype(archetype_id)
    all_llm_calls: list[dict] = []

    # ── Step 1: Fact Extraction ────────────────────────────────────────────
    fact_result = await extract_facts(
        plaintiff_narrative=plaintiff_narrative,
        defendant_narrative=defendant_narrative,
        plaintiff_name=plaintiff_name,
        defendant_name=defendant_name,
        claimed_amount=claimed_amount,
    )
    all_llm_calls.append(fact_result["llm_metadata"])
    facts = fact_result["facts"]

    # ── Step 2: Issue Classification (depends on facts) ─────────────────
    classification_result = await classify_issues(facts)
    all_llm_calls.append(classification_result["llm_metadata"])
    classification = classification_result["classification"]

    # ── Step 3: Rule Retrieval ─────────────────────────────────────────────
    case_type = classification.get("primary_type", "other")
    claim_desc = classification.get("summary", "")
    disputed = facts.get("disputed_issues", [])

    rules = await get_applicable_rules(
        db=db,
        case_type=case_type,
        claim_description=claim_desc,
        disputed_issues=disputed,
    )

    # ── Step 4: Evidence Scoring ───────────────────────────────────────────
    scoring_result = await score_evidence(
        extracted_facts=facts,
        classification=classification,
        claim_elements=rules["claim_elements"],
        archetype_modifiers=archetype.get("evidence_modifiers"),
    )
    all_llm_calls.append(scoring_result["llm_metadata"])
    scores = scoring_result["scores"]

    # ── Step 5: Judicial Reasoning ─────────────────────────────────────────
    reasoning_result = await generate_reasoning(
        extracted_facts=facts,
        classification=classification,
        applicable_rules=rules,
        evidence_scores=scores,
        archetype=archetype,
        hearing_transcript=hearing_transcript,
    )
    all_llm_calls.append(reasoning_result["llm_metadata"])
    reasoning = reasoning_result["reasoning"]

    # ── Steps 6 & 7: Decision + Advisory (parallel — no mutual dependency) ─
    decision_task = generate_decision(
        reasoning_chain=reasoning,
        extracted_facts=facts,
        classification=classification,
        evidence_scores=scores,
        archetype=archetype,
    )
    advisory_task = generate_advisory(
        extracted_facts=facts,
        classification=classification,
        evidence_scores=scores,
        reasoning_chain=reasoning,
        claim_elements=rules["claim_elements"],
        archetype=archetype,
        claimed_amount=claimed_amount,
    )
    decision_result, advisory_result = await asyncio.gather(
        decision_task, advisory_task,
    )
    all_llm_calls.append(decision_result["llm_metadata"])
    decision = decision_result["decision"]
    all_llm_calls.append(advisory_result["llm_metadata"])
    advisory = advisory_result["advisory"]

    # ── Compile results ────────────────────────────────────────────────────
    total_cost = sum(c["cost_usd"] for c in all_llm_calls)
    total_latency = sum(c["latency_ms"] for c in all_llm_calls)

    return {
        "judgment": decision,
        "reasoning_chain": reasoning,
        "evidence_scores": scores,
        "classification": classification,
        "extracted_facts": facts,
        "applicable_rules": {
            "claim_elements": rules["claim_elements"],
            "static_rules_used": list(rules["static_rules"].keys()),
            "corpus_chunks_retrieved": len(rules.get("retrieved_corpus", [])),
        },
        "advisory": advisory,
        "archetype": {
            "id": archetype["id"],
            "name": archetype["name"],
        },
        "pipeline_metadata": {
            "total_cost_usd": round(total_cost, 4),
            "total_latency_ms": total_latency,
            "llm_calls": all_llm_calls,
            "steps_completed": 7,
        },
    }
