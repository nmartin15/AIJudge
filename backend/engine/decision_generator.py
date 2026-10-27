"""
Step 6: Decision Generator.

Produces the formal judgment document: findings of fact, conclusions of law,
judgment amount, and plain-language rationale.
"""

import json

from engine.llm_client import call_anthropic

DECISION_PROMPT = """\
You are {judge_name}, drafting an educational rehearsal of a Wyoming small
claims outcome. This is not a court order and must not be written as one.

{judge_personality}

Based on the reasoning chain provided, draft a clear result a non-lawyer can
follow. Cite a statute or rule only when that authority appears in the
reasoning chain or the supplied legal framework. If it does not, name the
legal principle and leave legal_basis as "principle". Do not invent
subsection numbers. The small-claims cap is $6,000 exclusive of costs.

Return valid JSON with this exact structure:
{{
  "findings_of_fact": [
    "The Court finds that ... (numbered factual findings)"
  ],
  "conclusions_of_law": [
    {{
      "conclusion": "The Court concludes that ...",
      "legal_basis": "principle, or a citation that appears in the supplied framework"
    }}
  ],
  "judgment_text": "Simulated result, not a court order: [who prevails, the amount if any, and any condition on proof]",
  "rationale": "A plain-language explanation of why this rehearsal came out this way, including that one user supplied both sides.",
  "awarded_amount": 0.00 or null,
  "in_favor_of": "plaintiff" or "defendant",
  "costs_awarded": true/false,
  "costs_note": "explanation of cost award if applicable"
}}
"""


async def generate_decision(
    reasoning_chain: dict,
    extracted_facts: dict,
    classification: dict,
    evidence_scores: dict,
    archetype: dict,
) -> dict:
    """
    Generate the formal judgment document from the reasoning chain.

    Args:
        reasoning_chain: From reasoning_engine
        extracted_facts: Original facts for party names
        classification: Case classification
        evidence_scores: Evidence scoring results
        archetype: Judge archetype configuration

    Returns:
        dict with formal judgment and LLM metadata
    """
    system = DECISION_PROMPT.format(
        judge_name=archetype.get("name", "The Court"),
        judge_personality=archetype.get("personality_prompt", "You are fair and impartial."),
    )

    context = (
        f"CASE TYPE: {classification.get('primary_type', 'unknown')}\n\n"
        f"PARTIES:\n{json.dumps(extracted_facts.get('parties', {}), indent=2)}\n\n"
        f"REASONING CHAIN:\n{json.dumps(reasoning_chain, indent=2)}\n\n"
        f"EVIDENCE SCORES SUMMARY:\n"
        f"  Overall Plaintiff Strength: {evidence_scores.get('overall_plaintiff_strength', 'N/A')}\n"
        f"  Overall Defendant Strength: {evidence_scores.get('overall_defendant_strength', 'N/A')}\n"
        f"  Key Evidence: {evidence_scores.get('key_evidence_summary', 'N/A')}\n"
    )

    response = await call_anthropic(
        system=system,
        messages=[{"role": "user", "content": context}],
        temperature=0.2,
        max_tokens=4096,
    )

    try:
        decision = json.loads(response["content"])
    except json.JSONDecodeError:
        content = response["content"]
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                decision = json.loads(content[start:end])
            except json.JSONDecodeError:
                decision = {"error": "Failed to parse decision", "raw": content}
        else:
            decision = {"error": "Failed to parse decision", "raw": content}

    return {
        "decision": decision,
        "llm_metadata": {
            "model": response["model"],
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "cost_usd": response["cost_usd"],
            "latency_ms": response["latency_ms"],
            "pipeline_step": "decision_generation",
        },
    }
