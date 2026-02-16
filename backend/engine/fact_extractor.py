"""
Step 1: Fact Extraction Module.

Turns raw user narratives into structured case facts using GPT-4o.
Extracts: parties, claims, dates, amounts, evidence list, disputed issues.
"""

import json

from engine.llm_client import call_openai

FACT_EXTRACTION_PROMPT = """\
You are a legal fact extractor for Wyoming small claims court cases.

Given the plaintiff's and defendant's narratives, extract structured facts.
Be precise and factual. Do not infer facts not stated by either party.

Return valid JSON with this exact structure:
{
  "parties": {
    "plaintiff": {
      "name": "string",
      "role_description": "brief description of their role (tenant, buyer, etc.)"
    },
    "defendant": {
      "name": "string",
      "role_description": "brief description of their role (landlord, seller, etc.)"
    }
  },
  "claims": [
    {
      "description": "brief description of the claim",
      "amount": 0.00,
      "basis": "contract | negligence | statute | debt | other"
    }
  ],
  "key_dates": [
    {
      "date": "YYYY-MM-DD or approximate description",
      "event": "what happened"
    }
  ],
  "claimed_amount": 0.00,
  "evidence_mentioned": {
    "plaintiff": [
      {
        "type": "document | photo | receipt | testimony | text_message | email | contract",
        "description": "what the evidence shows"
      }
    ],
    "defendant": [
      {
        "type": "document | photo | receipt | testimony | text_message | email | contract",
        "description": "what the evidence shows"
      }
    ]
  },
  "disputed_issues": [
    {
      "issue": "description of what the parties disagree about",
      "plaintiff_position": "plaintiff's version",
      "defendant_position": "defendant's version"
    }
  ],
  "undisputed_facts": [
    "facts both parties agree on"
  ]
}
"""


async def extract_facts(
    plaintiff_narrative: str,
    defendant_narrative: str,
    plaintiff_name: str = "Plaintiff",
    defendant_name: str = "Defendant",
    claimed_amount: float | None = None,
) -> dict:
    """
    Extract structured facts from both parties' narratives.

    Returns:
        dict with extracted facts and LLM call metadata
    """
    user_message = (
        f"PLAINTIFF ({plaintiff_name}) NARRATIVE:\n{plaintiff_narrative}\n\n"
        f"DEFENDANT ({defendant_name}) NARRATIVE:\n{defendant_narrative}"
    )
    if claimed_amount is not None:
        user_message += f"\n\nCLAIMED AMOUNT: ${claimed_amount:,.2f}"

    response = await call_openai(
        messages=[
            {"role": "system", "content": FACT_EXTRACTION_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )

    # Parse the JSON response
    try:
        facts = json.loads(response["content"])
    except json.JSONDecodeError:
        facts = {"error": "Failed to parse fact extraction response", "raw": response["content"]}

    return {
        "facts": facts,
        "llm_metadata": {
            "model": response["model"],
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "cost_usd": response["cost_usd"],
            "latency_ms": response["latency_ms"],
            "pipeline_step": "fact_extraction",
        },
    }
