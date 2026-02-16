"""
Step 7: Case Advisory Engine.

Transforms pipeline outputs into actionable recommendations for the user.
Generates: case strength score, evidence improvement advice, strategic
recommendations, and court-day preparation materials.
"""

import json

from engine.llm_client import call_anthropic


def compute_case_strength(
    evidence_scores: dict,
    reasoning_chain: dict,
    classification: dict,
) -> dict:
    """
    Derive a 0-10 case strength score from existing pipeline data.
    No additional LLM call needed.
    """
    plaintiff_overall = evidence_scores.get("overall_plaintiff_strength", 0)
    defendant_overall = evidence_scores.get("overall_defendant_strength", 0)

    element_scores = evidence_scores.get("element_scores", [])
    if element_scores:
        avg_plaintiff = sum(
            e.get("plaintiff_score", 0) for e in element_scores
        ) / len(element_scores)
        avg_defendant = sum(
            e.get("defendant_score", 0) for e in element_scores
        ) / len(element_scores)
    else:
        avg_plaintiff = plaintiff_overall
        avg_defendant = defendant_overall

    # Advantage ratio (how much stronger plaintiff evidence is)
    total = max(0.01, avg_plaintiff + avg_defendant)
    advantage_ratio = avg_plaintiff / total

    # Confidence modifier from reasoning
    confidence = reasoning_chain.get("final_determination", {}).get("confidence", "moderate")
    conf_mod = {"high": 1.2, "moderate": 1.0, "low": 0.8}.get(confidence, 1.0)

    # Liability element success rate
    liability = reasoning_chain.get("liability_analysis", [])
    if liability:
        proven_count = sum(1 for el in liability if el.get("finding") == "proven")
        element_rate = proven_count / len(liability)
    else:
        element_rate = 0.5

    # Damages proven modifier
    damages = reasoning_chain.get("damages_analysis", {})
    damages_mod = 1.0 if damages.get("damages_proven", False) else 0.7

    # Composite score: weighted combination
    raw_score = (
        (advantage_ratio * 3.0)      # 0-3 from evidence advantage
        + (element_rate * 4.0)        # 0-4 from liability elements proven
        + (avg_plaintiff / 3.0 * 2.0) # 0-2 from absolute evidence quality
        + (1.0 * damages_mod)         # 0-1 from damages
    ) * conf_mod

    score = round(min(10.0, max(0.0, raw_score)), 1)

    if score >= 8.0:
        label = "Very Strong"
    elif score >= 6.5:
        label = "Strong"
    elif score >= 4.5:
        label = "Moderate"
    elif score >= 3.0:
        label = "Weak"
    else:
        label = "Very Weak"

    prevailing = reasoning_chain.get("final_determination", {}).get("prevailing_party", "unknown")

    return {
        "score": score,
        "label": label,
        "prevailing_party": prevailing,
        "confidence": confidence,
        "elements_proven": sum(1 for el in liability if el.get("finding") == "proven"),
        "elements_total": len(liability),
        "damages_proven": damages.get("damages_proven", False),
        "amount_justified": damages.get("amount_justified"),
    }


def derive_evidence_recommendations(
    evidence_scores: dict,
    claim_elements: dict,
) -> list[dict]:
    """
    Build specific evidence improvement recommendations from scores.
    No LLM call — pure data transformation.
    """
    recommendations = []
    element_scores = evidence_scores.get("element_scores", [])

    for entry in element_scores:
        p_score = entry.get("plaintiff_score", 0)
        d_score = entry.get("defendant_score", 0)
        element = entry.get("element", "Unknown element")

        if p_score >= 3:
            continue

        priority = "critical" if p_score == 0 else "high" if p_score == 1 else "medium"

        improvement_map = {
            0: "You have no evidence for this element. This is a significant gap the judge will notice.",
            1: "You only have self-serving testimony. Bring documentary evidence to corroborate your claim.",
            2: "You have partial documentation. Strengthen with additional records, timestamps, or third-party verification.",
        }

        recommendations.append({
            "element": element,
            "current_score": p_score,
            "defendant_score": d_score,
            "priority": priority,
            "gap_description": improvement_map.get(p_score, ""),
            "plaintiff_evidence": entry.get("plaintiff_evidence", ""),
            "net_assessment": entry.get("net_assessment", ""),
        })

    recommendations.sort(key=lambda r: {"critical": 0, "high": 1, "medium": 2}.get(r["priority"], 3))
    return recommendations


def synthesize_comparison_insights(comparison_results: list[dict]) -> dict | None:
    """
    Analyze multi-judge comparison results to extract consensus, risks,
    and strategic insights. No LLM call needed.
    """
    if not comparison_results or len(comparison_results) < 2:
        return None

    winners = [r.get("in_favor_of", "unknown") for r in comparison_results]
    amounts = [float(r.get("awarded_amount", 0) or 0) for r in comparison_results]
    archetype_ids = [r.get("archetype_id", "unknown") for r in comparison_results]

    plaintiff_count = sum(1 for w in winners if w == "plaintiff")
    defendant_count = len(winners) - plaintiff_count
    total = len(winners)

    # Consensus
    if plaintiff_count == total:
        consensus = "unanimous_plaintiff"
        consensus_text = f"All {total} judges would rule in the plaintiff's favor. This is a strong case."
    elif defendant_count == total:
        consensus = "unanimous_defendant"
        consensus_text = f"All {total} judges would rule for the defendant. The plaintiff faces significant challenges."
    elif plaintiff_count > defendant_count:
        consensus = "majority_plaintiff"
        consensus_text = (
            f"{plaintiff_count} out of {total} judges favor the plaintiff. "
            f"The case is favorable but has vulnerabilities."
        )
    elif defendant_count > plaintiff_count:
        consensus = "majority_defendant"
        consensus_text = (
            f"{defendant_count} out of {total} judges favor the defendant. "
            f"The plaintiff needs to strengthen their case significantly."
        )
    else:
        consensus = "split"
        consensus_text = "Judges are evenly split. This case could go either way depending on presentation."

    # Award range
    award_range = {
        "min": min(amounts),
        "max": max(amounts),
        "avg": round(sum(amounts) / len(amounts), 2) if amounts else 0,
        "median": sorted(amounts)[len(amounts) // 2] if amounts else 0,
    }

    # Identify the swing judges and risks
    risks = []
    favorable_judges = []
    for i, r in enumerate(comparison_results):
        archetype = archetype_ids[i]
        winner = winners[i]

        if winner == "defendant" and plaintiff_count > 0:
            risks.append({
                "archetype_id": archetype,
                "reason": r.get("reasoning_chain", {}).get(
                    "final_determination", {}
                ).get("reasoning_summary", "Evidence insufficient"),
            })
        elif winner == "plaintiff":
            favorable_judges.append(archetype)

    return {
        "consensus": consensus,
        "consensus_text": consensus_text,
        "plaintiff_wins": plaintiff_count,
        "defendant_wins": defendant_count,
        "total_judges": total,
        "award_range": award_range,
        "risks": risks,
        "favorable_judges": favorable_judges,
    }


ADVISORY_PROMPT = """\
You are a legal preparation advisor helping someone prepare for Wyoming \
small claims court. Based on the case analysis below, provide specific, \
actionable advice.

You are NOT a judge — you are helping the plaintiff prepare the strongest \
possible presentation of their case. Be direct, practical, and specific.

IMPORTANT: This is for educational purposes only. Always remind that this \
is not legal advice.

Given the case analysis data, generate a JSON response with:

1. "evidence_actions" — For each weak evidence element, provide a SPECIFIC \
   action the plaintiff can take. Don't be vague — tell them exactly what \
   document, record, or evidence to bring and why it matters.

2. "strategic_advice" — 3-5 practical strategic recommendations covering:
   - Claim amount optimization (should they adjust their claim?)
   - Presentation strategy (what to emphasize, what order)
   - Potential weaknesses to address proactively
   - Mitigation/resolution attempts to document

3. "court_preparation" — Materials for court day:
   - "case_summary": A 2-3 sentence plain-language summary of the case \
     the plaintiff can use as their opening
   - "evidence_checklist": List of items to bring to court with priority
   - "opening_statement": A suggested 30-second opening statement
   - "anticipated_questions": 4-6 questions the judge is likely to ask
   - "key_points": The 3-4 most important points to make during the hearing

Return valid JSON with this exact structure:
{{
  "evidence_actions": [
    {{
      "element": "the legal element",
      "current_strength": "none | weak | moderate",
      "action": "specific action to take",
      "what_to_bring": "specific document or evidence to obtain",
      "impact": "how this improves the case"
    }}
  ],
  "strategic_advice": [
    {{
      "category": "claim_amount | presentation | weakness | mitigation | timing",
      "title": "short title",
      "advice": "specific actionable advice",
      "priority": "high | medium | low"
    }}
  ],
  "court_preparation": {{
    "case_summary": "2-3 sentence summary",
    "evidence_checklist": [
      {{
        "item": "what to bring",
        "priority": "critical | important | helpful",
        "note": "why this matters"
      }}
    ],
    "opening_statement": "suggested opening statement text",
    "anticipated_questions": [
      {{
        "question": "what the judge might ask",
        "suggested_approach": "how to respond effectively"
      }}
    ],
    "key_points": [
      "most important point to make"
    ]
  }}
}}
"""


async def generate_advisory(
    extracted_facts: dict,
    classification: dict,
    evidence_scores: dict,
    reasoning_chain: dict,
    claim_elements: dict,
    archetype: dict,
    claimed_amount: float | None = None,
) -> dict:
    """
    Generate the complete case advisory from pipeline data.

    Combines computed metrics (no LLM) with one focused LLM call for
    actionable text recommendations.

    Returns:
        dict with case_strength, recommendations, court_preparation, and LLM metadata
    """
    # ── Computed metrics (no LLM call) ─────────────────────────────────
    case_strength = compute_case_strength(
        evidence_scores, reasoning_chain, classification,
    )

    evidence_recs = derive_evidence_recommendations(
        evidence_scores, claim_elements,
    )

    # ── LLM-generated advisory ─────────────────────────────────────────
    context_parts = [
        f"CASE TYPE: {classification.get('primary_type', 'unknown')}",
        f"CASE SUMMARY: {classification.get('summary', 'N/A')}",
        f"CLAIMED AMOUNT: ${claimed_amount:,.2f}" if claimed_amount else "CLAIMED AMOUNT: Not specified",
        f"CASE STRENGTH SCORE: {case_strength['score']}/10 ({case_strength['label']})",
        f"PREVAILING PARTY (predicted): {case_strength['prevailing_party']}",
        f"ELEMENTS PROVEN: {case_strength['elements_proven']}/{case_strength['elements_total']}",
        f"DAMAGES PROVEN: {case_strength['damages_proven']}",
        f"AMOUNT JUSTIFIED: ${case_strength.get('amount_justified', 'N/A')}",
        "",
        "EXTRACTED FACTS:",
        json.dumps(extracted_facts, indent=2),
        "",
        "EVIDENCE SCORES:",
        json.dumps(evidence_scores, indent=2),
        "",
        "REASONING CHAIN:",
        json.dumps(reasoning_chain, indent=2),
        "",
        "CLAIM ELEMENTS REQUIRED:",
        json.dumps(claim_elements, indent=2),
    ]
    context = "\n".join(context_parts)

    response = await call_anthropic(
        system=ADVISORY_PROMPT,
        messages=[{"role": "user", "content": context}],
        temperature=0.3,
        max_tokens=4096,
    )

    try:
        advisory_llm = json.loads(response["content"])
    except json.JSONDecodeError:
        content = response["content"]
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                advisory_llm = json.loads(content[start:end])
            except json.JSONDecodeError:
                advisory_llm = {"error": "Failed to parse advisory", "raw": content}
        else:
            advisory_llm = {"error": "Failed to parse advisory", "raw": content}

    return {
        "advisory": {
            "case_strength": case_strength,
            "evidence_recommendations": evidence_recs,
            "evidence_actions": advisory_llm.get("evidence_actions", []),
            "strategic_advice": advisory_llm.get("strategic_advice", []),
            "court_preparation": advisory_llm.get("court_preparation", {}),
        },
        "llm_metadata": {
            "model": response["model"],
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "cost_usd": response["cost_usd"],
            "latency_ms": response["latency_ms"],
            "pipeline_step": "case_advisory",
        },
    }
