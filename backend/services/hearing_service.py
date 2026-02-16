"""Hearing business logic shared between WebSocket and HTTP handlers.

Extracts message persistence, sequence management, judge response generation,
and conclusion detection from the API layer so both transports use identical logic.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.database import (
    Case,
    CaseStatus,
    Hearing,
    HearingMessage,
    HearingMessageRole,
    Party,
    PartyRole,
)
from prompts.system_prompts import generate_hearing_message


CONCLUSION_MARKER = "hearing is now concluded"


def build_case_context(case: Case, parties: list[Party]) -> dict:
    """Build the context dict consumed by hearing prompt generation."""
    plaintiff_name = "Plaintiff"
    defendant_name = "Defendant"
    for p in parties:
        if p.role == PartyRole.PLAINTIFF:
            plaintiff_name = p.name
        elif p.role == PartyRole.DEFENDANT:
            defendant_name = p.name

    return {
        "case_type": case.case_type.value if case.case_type else "unknown",
        "plaintiff_name": plaintiff_name,
        "defendant_name": defendant_name,
        "plaintiff_narrative": case.plaintiff_narrative or "",
        "defendant_narrative": case.defendant_narrative or "",
        "claimed_amount": float(case.claimed_amount) if case.claimed_amount else 0,
    }


def extract_party_names(case: Case) -> tuple[str, str]:
    """Return (plaintiff_name, defendant_name) from loaded case.parties."""
    plaintiff_name = "Plaintiff"
    defendant_name = "Defendant"
    for party in case.parties:
        if party.role == PartyRole.PLAINTIFF:
            plaintiff_name = party.name
        elif party.role == PartyRole.DEFENDANT:
            defendant_name = party.name
    return plaintiff_name, defendant_name


@dataclass(frozen=True, slots=True)
class JudgeExchangeResult:
    """Result of a single party-message → judge-response exchange."""
    judge_content: str
    judge_sequence: int
    concluded: bool


async def get_next_sequence(db: AsyncSession, hearing_id) -> int:
    """Return the current max sequence number for a hearing (0 if empty)."""
    result = await db.execute(
        select(func.max(HearingMessage.sequence))
        .where(HearingMessage.hearing_id == hearing_id)
    )
    return result.scalar() or 0


async def process_hearing_exchange(
    db: AsyncSession,
    *,
    hearing_id,
    archetype_id: str,
    case_context: dict,
    user_role: HearingMessageRole,
    user_content: str,
) -> JudgeExchangeResult:
    """Save a user message, generate the judge response, and persist it.

    This is the core hearing loop used by both the WebSocket and HTTP handlers.
    The caller is responsible for committing the transaction.
    """
    max_seq = await get_next_sequence(db, hearing_id)

    # Persist the user's message
    user_msg = HearingMessage(
        hearing_id=hearing_id,
        role=user_role,
        content=user_content,
        sequence=max_seq + 1,
    )
    db.add(user_msg)
    await db.flush()

    # Build conversation history for the LLM
    msgs_result = await db.execute(
        select(HearingMessage)
        .where(HearingMessage.hearing_id == hearing_id)
        .order_by(HearingMessage.sequence)
    )
    history = [
        {"role": m.role.value, "content": m.content}
        for m in msgs_result.scalars().all()
    ]

    # Generate the judge's response
    judge_response = await generate_hearing_message(
        archetype_id=archetype_id,
        case_context=case_context,
        conversation_history=history,
    )

    judge_content = judge_response["content"]
    judge_seq = max_seq + 2

    # Persist the judge's message
    judge_msg = HearingMessage(
        hearing_id=hearing_id,
        role=HearingMessageRole.JUDGE,
        content=judge_content,
        sequence=judge_seq,
    )
    db.add(judge_msg)

    # Detect hearing conclusion
    concluded = CONCLUSION_MARKER in judge_content.lower()
    if concluded:
        hearing_obj = await db.get(Hearing, hearing_id)
        if hearing_obj:
            hearing_obj.completed_at = func.now()

    return JudgeExchangeResult(
        judge_content=judge_content,
        judge_sequence=judge_seq,
        concluded=concluded,
    )
