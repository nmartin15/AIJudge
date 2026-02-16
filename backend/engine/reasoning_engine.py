"""
Step 5: Judicial Reasoning Engine.

Produces a structured reasoning chain following Wyoming small claims
judicial methodology. Uses Claude for nuanced legal analysis.
"""

import json

from engine.llm_client import call_anthropic

REASONING_PROMPT = """\
You are {judge_name}, a Wyoming small claims court judge.

{judge_personality}

You are deliberating on a case and must produce a structured reasoning chain.
Follow the standard Wyoming small claims judicial reasoning framework:

1. WHAT HAPPENED — Establish the factual narrative from both perspectives
2. EVIDENCE ASSESSMENT — What evidence supports each side's version
3. LIABILITY ANALYSIS — Apply the legal elements to the proven facts
4. DAMAGES ANALYSIS — Are damages proven with reasonable certainty
5. FINAL DETERMINATION — Who prevails and why

Important Wyoming-specific considerations:
- The standard is preponderance of the evidence (more likely than not)
- Formal rules of evidence do not apply; consider all reliable evidence
- The plaintiff bears the burden of proof on each element
- Damages must be proven with reasonable certainty
- Maximum recovery is $6,000 exclusive of interest and costs

Return valid JSON with this exact structure:
{{
  "factual_narrative": "what the judge finds actually happened, resolving disputed facts",
  "credibility_assessment": "assessment of each party's credibility",
  "evidence_analysis": {{
    "strongest_plaintiff_evidence": "description",
    "strongest_defendant_evidence": "description",
    "key_evidence_conflicts": "how conflicts were resolved"
  }},
  "liability_analysis": [
    {{
      "element": "the legal element",
      "finding": "proven | not_proven",
      "reasoning": "why the judge finds this element proven or not"
    }}
  ],
  "damages_analysis": {{
    "damages_proven": true/false,
    "amount_claimed": 0.00,
    "amount_justified": 0.00,
    "reasoning": "how the damage amount was determined"
  }},
  "counterclaim_analysis": {{
    "counterclaim_exists": false,
    "counterclaim_merit": null,
    "counterclaim_amount": null
  }},
  "final_determination": {{
    "prevailing_party": "plaintiff | defendant",
    "reasoning_summary": "concise explanation of why this party prevails",
    "confidence": "high | moderate | low"
  }}
}}
"""


async def generate_reasoning(
    extracted_facts: dict,
    classification: dict,
    applicable_rules: dict,
    evidence_scores: dict,
    archetype: dict,
    hearing_transcript: list[dict] | None = None,
) -> dict:
    """
    Generate the judicial reasoning chain.

    Args:
        extracted_facts: From fact_extractor
        classification: From issue_classifier
        applicable_rules: From rule_engine
        evidence_scores: From evidence_scorer
        archetype: Judge archetype configuration
        hearing_transcript: Optional hearing messages for additional context

    Returns:
        dict with reasoning chain and LLM metadata
    """
    # Build the system prompt with judge personality
    system = REASONING_PROMPT.format(
        judge_name=archetype.get("name", "The Court"),
        judge_personality=archetype.get("personality_prompt", "You are fair and impartial."),
    )

    # Build the case context
    context_parts = [
        f"CASE TYPE: {classification.get('primary_type', 'unknown')}",
        f"CASE SUMMARY: {classification.get('summary', 'N/A')}",
        "",
        "EXTRACTED FACTS:",
        json.dumps(extracted_facts, indent=2),
        "",
        "LEGAL ISSUES:",
        json.dumps(classification.get("legal_issues", []), indent=2),
        "",
        "APPLICABLE RULES AND CLAIM ELEMENTS:",
        json.dumps(
            {
                "claim_elements": applicable_rules.get("claim_elements", {}),
                "key_static_rules": {
                    k: applicable_rules["static_rules"][k]
                    for k in ["burden_of_proof", "evidence_rules", "damages"]
                    if k in applicable_rules.get("static_rules", {})
                },
            },
            indent=2,
        ),
        "",
        "RETRIEVED LEGAL AUTHORITIES:",
    ]

    for chunk in applicable_rules.get("retrieved_corpus", []):
        context_parts.append(
            f"  [{chunk['source_type'].upper()}] {chunk.get('section_number', '')} — "
            f"{chunk['source_title']}\n  {chunk['content'][:500]}"
        )

    context_parts.extend(
        [
            "",
            "EVIDENCE SCORES:",
            json.dumps(evidence_scores, indent=2),
        ]
    )

    if hearing_transcript:
        context_parts.extend(
            [
                "",
                "HEARING TRANSCRIPT:",
            ]
        )
        for msg in hearing_transcript:
            context_parts.append(f"  {msg['role'].upper()}: {msg['content']}")

    context = "\n".join(context_parts)

    response = await call_anthropic(
        system=system,
        messages=[{"role": "user", "content": context}],
        temperature=0.3,
        max_tokens=6000,
    )

    try:
        reasoning = json.loads(response["content"])
    except json.JSONDecodeError:
        content = response["content"]
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                reasoning = json.loads(content[start:end])
            except json.JSONDecodeError:
                reasoning = {"error": "Failed to parse reasoning", "raw": content}
        else:
            reasoning = {"error": "Failed to parse reasoning", "raw": content}

    return {
        "reasoning": reasoning,
        "llm_metadata": {
            "model": response["model"],
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "cost_usd": response["cost_usd"],
            "latency_ms": response["latency_ms"],
            "pipeline_step": "judicial_reasoning",
        },
    }
