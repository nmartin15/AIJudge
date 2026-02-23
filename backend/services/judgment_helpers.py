"""Shared helpers used by both judgment and comparison endpoints."""

import hashlib
import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from api.security import get_owned_case
from models.database import Case, Hearing, PartyRole


def extract_hearing_transcript(hearing: Hearing | None) -> list[dict] | None:
    if not hearing or not hearing.messages:
        return None
    return [
        {"role": message.role.value, "content": message.content}
        for message in sorted(hearing.messages, key=lambda item: item.sequence)
    ]


def derive_winner(value: str | None) -> PartyRole:
    winner = (value or "defendant").lower()
    return PartyRole.plaintiff if "plaintiff" in winner else PartyRole.defendant


def comparison_run_key(
    case: Case,
    hearing: Hearing | None,
    archetype_ids: list[str],
) -> str:
    key_payload = {
        "case_id": str(case.id),
        "archetype_ids": sorted(archetype_ids),
        "plaintiff_narrative": case.plaintiff_narrative,
        "defendant_narrative": case.defendant_narrative,
        "claimed_amount": float(case.claimed_amount) if case.claimed_amount is not None else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
        "hearing_completed_at": hearing.completed_at.isoformat() if hearing and hearing.completed_at else None,
        "hearing_message_count": len(hearing.messages) if hearing and hearing.messages else 0,
    }
    serialized = json.dumps(key_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


async def get_case_and_hearing_context(
    db: AsyncSession,
    case_id: uuid.UUID,
    session_id: str,
) -> tuple[Case, Hearing | None]:
    case = await get_owned_case(
        db,
        case_id,
        session_id,
        options=(
            selectinload(Case.parties),
            selectinload(Case.evidence),
            selectinload(Case.timeline_events),
        ),
    )
    hearing_result = await db.execute(
        select(Hearing)
        .where(Hearing.case_id == case_id)
        .options(selectinload(Hearing.messages))
    )
    hearing = hearing_result.scalar_one_or_none()
    return case, hearing
