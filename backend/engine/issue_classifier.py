"""
Step 2: Issue Classification Module.

Classifies the case type and identifies specific legal issues using GPT-4o.
Categories: Contract, Property Damage, Security Deposit, Loan/Debt, Consumer, Other.
"""

import json

from engine.llm_client import call_openai

CLASSIFICATION_PROMPT = """\
You are a Wyoming small claims court case classifier.

Given the extracted facts from a case, classify the case type and identify
the specific legal issues that the judge must decide.

Wyoming small claims court handles cases up to $6,000.

Return valid JSON with this exact structure:
{
  "primary_type": "contract | property_damage | security_deposit | loan_debt | consumer | other",
  "primary_confidence": 0.0 to 1.0,
  "secondary_type": "optional secondary classification or null",
  "secondary_confidence": 0.0 to 1.0 or null,
  "legal_issues": [
    {
      "issue": "description of the legal question",
      "elements_to_prove": [
        "each element the plaintiff must establish"
      ],
      "relevant_law": "brief description of applicable Wyoming law"
    }
  ],
  "jurisdictional_check": {
    "amount_within_limit": true/false,
    "proper_claim_type": true/false,
    "notes": "any jurisdictional concerns"
  },
  "complexity_score": 1 to 5,
  "summary": "one-paragraph summary of what this case is about"
}
"""


async def classify_issues(extracted_facts: dict) -> dict:
    """
    Classify the case type and identify legal issues.

    Args:
        extracted_facts: Output from fact_extractor.extract_facts()

    Returns:
        dict with classification and LLM call metadata
    """
    response = await call_openai(
        messages=[
            {"role": "system", "content": CLASSIFICATION_PROMPT},
            {"role": "user", "content": f"EXTRACTED CASE FACTS:\n{json.dumps(extracted_facts, indent=2)}"},
        ],
        temperature=0.1,
        max_tokens=2048,
        response_format={"type": "json_object"},
    )

    try:
        classification = json.loads(response["content"])
    except json.JSONDecodeError:
        classification = {"error": "Failed to parse classification response", "raw": response["content"]}

    return {
        "classification": classification,
        "llm_metadata": {
            "model": response["model"],
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "cost_usd": response["cost_usd"],
            "latency_ms": response["latency_ms"],
            "pipeline_step": "issue_classification",
        },
    }
