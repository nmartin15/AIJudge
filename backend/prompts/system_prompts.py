"""System prompts and hearing conversation logic."""

import json
from engine.llm_client import call_anthropic
from personas.archetypes import get_archetype


HEARING_SYSTEM_PROMPT = """\
You are {judge_name}, presiding over a Wyoming small claims hearing.

{judge_personality}

CASE CONTEXT:
- Case Type: {case_type}
- Plaintiff: {plaintiff_name} — {plaintiff_narrative_summary}
- Defendant: {defendant_name} — {defendant_narrative_summary}
- Amount Claimed: ${claimed_amount:,.2f}

Your role is to conduct an informal but structured hearing. You should:
1. Ask focused questions to clarify disputed facts
2. Request specific evidence when claims need support
3. Maintain control of the hearing while being {tone}
4. Focus on: {question_focus}
5. Keep questions concise and one at a time

IMPORTANT RULES:
- This is a SIMULATION for educational purposes only
- Stay in character as a Wyoming small claims judge
- Ask only questions relevant to the legal issues in the case
- Do not provide legal advice to either party
- When you have enough information, say "I have heard enough to make my decision. 
  This hearing is now concluded." and stop asking questions.

Respond with ONLY the judge's next statement or question. Do not include any
meta-commentary or out-of-character text.
"""


async def generate_hearing_message(
    archetype_id: str,
    case_context: dict,
    conversation_history: list[dict],
) -> dict:
    """
    Generate the judge's next hearing message.

    Args:
        archetype_id: Which judge personality to use
        case_context: Case details for context
        conversation_history: Previous messages in the hearing

    Returns:
        dict with judge's message and LLM metadata
    """
    archetype = get_archetype(archetype_id)
    hearing_style = archetype.get("hearing_style", {})

    system = HEARING_SYSTEM_PROMPT.format(
        judge_name=archetype["name"],
        judge_personality=archetype["personality_prompt"],
        case_type=case_context.get("case_type", "unknown"),
        plaintiff_name=case_context.get("plaintiff_name", "Plaintiff"),
        plaintiff_narrative_summary=case_context.get("plaintiff_narrative", "")[:300],
        defendant_name=case_context.get("defendant_name", "Defendant"),
        defendant_narrative_summary=case_context.get("defendant_narrative", "")[:300],
        claimed_amount=case_context.get("claimed_amount", 0),
        tone=hearing_style.get("tone", "fair and measured"),
        question_focus=", ".join(hearing_style.get("question_focus", ["relevant facts"])),
    )

    # If this is the first message, use the opening
    if not conversation_history:
        return {
            "content": hearing_style.get("opening", "Good morning. Plaintiff, please present your case."),
            "llm_metadata": None,
        }

    # Build conversation messages for the API
    messages = []
    for msg in conversation_history:
        role = "assistant" if msg["role"] == "judge" else "user"
        prefix = ""
        if msg["role"] in ("plaintiff", "defendant"):
            prefix = f"[{msg['role'].upper()}]: "
        messages.append({"role": role, "content": f"{prefix}{msg['content']}"})

    response = await call_anthropic(
        system=system,
        messages=messages,
        temperature=0.4,
        max_tokens=500,
    )

    return {
        "content": response["content"],
        "llm_metadata": {
            "model": response["model"],
            "input_tokens": response["input_tokens"],
            "output_tokens": response["output_tokens"],
            "cost_usd": response["cost_usd"],
            "latency_ms": response["latency_ms"],
            "pipeline_step": "hearing_simulation",
        },
    }
