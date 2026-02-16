"""
Step 4: Evidence Scoring Module.

Scores each piece of evidence on a 0-3 scale for each claim element.
Uses Claude for nuanced evaluation of evidence strength.
"""

import json

from engine.llm_client import call_anthropic

EVIDENCE_SCORING_PROMPT = """\
You are an experienced Wyoming small claims court judge evaluating evidence.

Score each piece of evidence for its relevance and strength in proving each
claim element. Use this scoring rubric:

  0 = NONE — No evidence presented for this element
  1 = WEAK — Self-serving testimony only, no corroboration, or irrelevant evidence
  2 = MODERATE — Some documentation or partial corroboration; evidence is relevant
                  but not conclusive
  3 = STRONG — Clear documentation (receipts, signed contracts, photographs,
               third-party witnesses, dated text messages); evidence directly
               and convincingly supports the element

Consider Wyoming small claims standards:
- Formal rules of evidence do not apply, but reliability matters
- Documentary evidence is generally stronger than oral testimony alone
- Corroborated evidence is stronger than uncorroborated
- Dated, specific evidence is stronger than general claims
- Original documents are preferred over copies

Return valid JSON with this exact structure:
{
  "element_scores": [
    {
      "element": "the claim element being evaluated",
      "plaintiff_score": 0-3,
      "plaintiff_evidence": "what plaintiff evidence supports this",
      "plaintiff_explanation": "why this score was assigned",
      "defendant_score": 0-3,
      "defendant_evidence": "what defendant evidence rebuts this",
      "defendant_explanation": "why this score was assigned",
      "net_assessment": "which side's evidence is stronger and why"
    }
  ],
  "overall_plaintiff_strength": 0-3,
  "overall_defendant_strength": 0-3,
  "credibility_notes": "observations about overall credibility of each side",
  "evidence_gaps": [
    "significant evidence that is missing and would be helpful"
  ],
  "key_evidence_summary": "paragraph summarizing the most important evidence"
}
"""


async def score_evidence(
    extracted_facts: dict,
    classification: dict,
    claim_elements: dict,
    archetype_modifiers: dict | None = None,
) -> dict:
    """
    Score evidence for each claim element.

    Args:
        extracted_facts: From fact_extractor
        classification: From issue_classifier
        claim_elements: From rule_engine (elements to prove)
        archetype_modifiers: Optional weight adjustments based on judge archetype

    Returns:
        dict with evidence scores and LLM metadata
    """
    # Build context for the scorer
    context = (
        f"CASE TYPE: {classification.get('primary_type', 'unknown')}\n"
        f"CASE SUMMARY: {classification.get('summary', 'N/A')}\n\n"
        f"ELEMENTS PLAINTIFF MUST PROVE:\n"
    )
    for i, element in enumerate(claim_elements.get("elements", []), 1):
        context += f"  {i}. {element}\n"

    context += f"\nDAMAGES MEASURE: {claim_elements.get('damages_measure', 'Actual damages')}\n\n"

    context += "EXTRACTED FACTS:\n"
    context += json.dumps(extracted_facts, indent=2)

    if archetype_modifiers:
        context += f"\n\nJUDGE PREFERENCES:\n{json.dumps(archetype_modifiers, indent=2)}"

    response = await call_anthropic(
        system=EVIDENCE_SCORING_PROMPT,
        messages=[{"role": "user", "content": context}],
        temperature=0.2,
        max_tokens=4096,
    )

    try:
        scores = json.loads(response["content"])
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        content = response["content"]
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                scores = json.loads(content[start:end])
            except json.JSONDecodeError:
                scores = {"error": "Failed to parse evidence scoring", "raw": content}
        else:
            scores = {"error": "Failed to parse evidence scoring", "raw": content}

    return {
        "scores": scores,
        "llm_metadata": {
            "model": response["model"],
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "cost_usd": response["cost_usd"],
            "latency_ms": response["latency_ms"],
            "pipeline_step": "evidence_scoring",
        },
    }
