"""Security-deposit claim track. Separate from wizard cases.

The claim page maps onto rows: a matter, a side per person, a claim, a document.
"""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.database import ClaimDocument, ClaimEntry, ClaimMatter, ClaimSide

DEPOSIT_CAP = 6000
VIEWERS = {"alex", "jordan"}


def _amount(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def amount_over_cap(value: object) -> bool:
    amount = _amount(value)
    return amount is not None and amount > DEPOSIT_CAP


def over_cap(payload: dict) -> bool:
    sides = payload.get("sides") or {}
    for side in sides.values():
        if isinstance(side, dict) and amount_over_cap(side.get("amount")):
            return True
    return False


def for_viewer(payload: dict, viewer: str | None) -> dict:
    """Return the record. The other person's private gaps are removed."""
    sides = payload.get("sides") or {}
    visible: dict = {}
    for owner, side in sides.items():
        if not isinstance(side, dict):
            continue
        shown = dict(side)
        if viewer in VIEWERS and owner != viewer:
            shown["privateGaps"] = []
        visible[owner] = shown
    return {
        "step": payload.get("step"),
        "owner": payload.get("owner"),
        "sides": visible,
    }


def _strings(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _header(side: dict) -> dict:
    return {
        "name": str(side.get("name") or ""),
        "otherName": str(side.get("otherName") or ""),
        "amount": str(side.get("amount") or ""),
        "wants": str(side.get("wants") or ""),
        "privateGaps": _strings(side.get("privateGaps")),
        "disputes": _strings(side.get("disputes")),
    }


class ClaimStore(Protocol):
    async def create(self, payload: dict) -> tuple[str, dict]: ...

    async def load(self, matter_id: str) -> dict | None: ...

    async def save_position(self, matter_id: str, step: str, owner: str | None) -> dict | None: ...

    async def save_header(self, matter_id: str, owner: str, header: dict) -> dict | None: ...

    async def create_claim(self, matter_id: str, owner: str, claim: dict) -> dict | None: ...

    async def update_claim(self, matter_id: str, owner: str, claim_id: str, patch: dict) -> dict | None: ...

    async def delete_claim(self, matter_id: str, owner: str, claim_id: str) -> dict | None: ...

    async def create_file(self, matter_id: str, owner: str, claim_id: str, file: dict) -> dict | None: ...

    async def delete_file(self, matter_id: str, owner: str, claim_id: str, file_id: str) -> dict | None: ...


def _side_or_none(record: dict, owner: str) -> dict | None:
    side = (record.get("sides") or {}).get(owner)
    return side if isinstance(side, dict) else None


def _claim_or_none(side: dict, claim_id: str) -> dict | None:
    for claim in side.get("claims") or []:
        if isinstance(claim, dict) and claim.get("id") == claim_id:
            return claim
    return None


class MemoryClaimStore:
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def _record(self, matter_id: str) -> dict | None:
        return self.rows.get(matter_id)

    async def create(self, payload: dict) -> tuple[str, dict]:
        matter_id = str(uuid.uuid4())
        sides: dict = {}
        for owner, side in (payload.get("sides") or {}).items():
            if owner not in VIEWERS or not isinstance(side, dict):
                continue
            sides[owner] = {**_header(side), "owner": owner, "claims": _claims(side.get("claims"))}
        self.rows[matter_id] = {
            "step": payload.get("step"),
            "owner": payload.get("owner"),
            "sides": sides,
        }
        return matter_id, copy.deepcopy(self.rows[matter_id])

    async def load(self, matter_id: str) -> dict | None:
        record = self._record(matter_id)
        return None if record is None else copy.deepcopy(record)

    async def save_position(self, matter_id: str, step: str, owner: str | None) -> dict | None:
        record = self._record(matter_id)
        if record is None:
            return None
        record["step"] = step
        record["owner"] = owner
        return copy.deepcopy(record)

    async def save_header(self, matter_id: str, owner: str, header: dict) -> dict | None:
        record = self._record(matter_id)
        side = None if record is None else _side_or_none(record, owner)
        if record is None or side is None:
            return None
        side.update(_header(header))
        return copy.deepcopy(record)

    async def create_claim(self, matter_id: str, owner: str, claim: dict) -> dict | None:
        record = self._record(matter_id)
        side = None if record is None else _side_or_none(record, owner)
        if record is None or side is None:
            return None
        claim_id = str(claim.get("id") or "")
        existing = _claim_or_none(side, claim_id)
        if existing is None:
            side.setdefault("claims", []).append(
                {"id": claim_id, "text": str(claim.get("text") or ""), "date": str(claim.get("date") or ""), "files": []}
            )
        else:
            existing["text"] = str(claim.get("text") or "")
            existing["date"] = str(claim.get("date") or "")
        return copy.deepcopy(record)

    async def update_claim(self, matter_id: str, owner: str, claim_id: str, patch: dict) -> dict | None:
        record = self._record(matter_id)
        side = None if record is None else _side_or_none(record, owner)
        claim = None if side is None else _claim_or_none(side, claim_id)
        if record is None or claim is None:
            return None
        if "text" in patch and patch["text"] is not None:
            claim["text"] = str(patch["text"])
        if "date" in patch and patch["date"] is not None:
            claim["date"] = str(patch["date"])
        return copy.deepcopy(record)

    async def delete_claim(self, matter_id: str, owner: str, claim_id: str) -> dict | None:
        record = self._record(matter_id)
        side = None if record is None else _side_or_none(record, owner)
        if record is None or side is None:
            return None
        side["claims"] = [claim for claim in side.get("claims") or [] if claim.get("id") != claim_id]
        return copy.deepcopy(record)

    async def create_file(self, matter_id: str, owner: str, claim_id: str, file: dict) -> dict | None:
        record = self._record(matter_id)
        side = None if record is None else _side_or_none(record, owner)
        claim = None if side is None else _claim_or_none(side, claim_id)
        if record is None or claim is None:
            return None
        file_id = str(file.get("id") or "")
        stored = {
            "id": file_id,
            "title": str(file.get("title") or ""),
            "kind": str(file.get("kind") or ""),
            "lines": _strings(file.get("lines")),
        }
        files = claim.setdefault("files", [])
        for index, current in enumerate(files):
            if current.get("id") == file_id:
                files[index] = stored
                return copy.deepcopy(record)
        files.append(stored)
        return copy.deepcopy(record)

    async def delete_file(self, matter_id: str, owner: str, claim_id: str, file_id: str) -> dict | None:
        record = self._record(matter_id)
        side = None if record is None else _side_or_none(record, owner)
        claim = None if side is None else _claim_or_none(side, claim_id)
        if record is None or claim is None:
            return None
        claim["files"] = [file for file in claim.get("files") or [] if file.get("id") != file_id]
        return copy.deepcopy(record)


def _claims(value: object) -> list[dict]:
    claims: list[dict] = []
    if not isinstance(value, list):
        return claims
    for claim in value:
        if not isinstance(claim, dict) or not claim.get("id"):
            continue
        files = []
        for file in claim.get("files") or []:
            if isinstance(file, dict) and file.get("id"):
                files.append(
                    {
                        "id": str(file["id"]),
                        "title": str(file.get("title") or ""),
                        "kind": str(file.get("kind") or ""),
                        "lines": _strings(file.get("lines")),
                    }
                )
        claims.append(
            {
                "id": str(claim["id"]),
                "text": str(claim.get("text") or ""),
                "date": str(claim.get("date") or ""),
                "files": files,
            }
        )
    return claims


def _assemble(matter: ClaimMatter) -> dict:
    sides: dict = {}
    for side in matter.sides:
        sides[side.owner] = {
            "owner": side.owner,
            "name": side.name,
            "otherName": side.other_name,
            "amount": side.amount,
            "wants": side.wants,
            "privateGaps": list(side.private_gaps or []),
            "disputes": list(side.disputes or []),
            "claims": [
                {
                    "id": claim.client_id,
                    "text": claim.text,
                    "date": claim.claim_date,
                    "files": [
                        {
                            "id": document.client_id,
                            "title": document.title,
                            "kind": document.kind,
                            "lines": list(document.lines or []),
                        }
                        for document in claim.files
                    ],
                }
                for claim in side.claims
            ],
        }
    return {"step": matter.step, "owner": matter.owner, "sides": sides}


class DbClaimStore:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _matter(self, matter_id: str) -> ClaimMatter | None:
        try:
            key = uuid.UUID(matter_id)
        except ValueError:
            return None
        stmt = (
            select(ClaimMatter)
            .where(ClaimMatter.id == key)
            .options(
                selectinload(ClaimMatter.sides).selectinload(ClaimSide.claims).selectinload(ClaimEntry.files)
            )
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    def _side(self, matter: ClaimMatter, owner: str) -> ClaimSide | None:
        return next((side for side in matter.sides if side.owner == owner), None)

    def _entry(self, side: ClaimSide, claim_id: str) -> ClaimEntry | None:
        return next((claim for claim in side.claims if claim.client_id == claim_id), None)

    async def _saved(self, matter: ClaimMatter) -> dict:
        matter.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        loaded = await self._matter(str(matter.id))
        return _assemble(loaded if loaded is not None else matter)

    async def create(self, payload: dict) -> tuple[str, dict]:
        matter = ClaimMatter(step=str(payload.get("step") or "welcome"), owner=payload.get("owner"))
        self.db.add(matter)
        await self.db.flush()
        for owner, side in (payload.get("sides") or {}).items():
            if owner not in VIEWERS or not isinstance(side, dict):
                continue
            self._append_side(matter, owner, side)
        saved = await self._saved(matter)
        return str(matter.id), saved

    def _append_side(self, matter: ClaimMatter, owner: str, side: dict) -> ClaimSide:
        header = _header(side)
        row = ClaimSide(
            matter=matter,
            owner=owner,
            name=header["name"],
            other_name=header["otherName"],
            amount=header["amount"],
            wants=header["wants"],
            private_gaps=header["privateGaps"],
            disputes=header["disputes"],
        )
        for index, claim in enumerate(_claims(side.get("claims"))):
            entry = ClaimEntry(
                side=row,
                client_id=claim["id"],
                text=claim["text"],
                claim_date=claim["date"],
                position=index,
            )
            for file_index, file in enumerate(claim["files"]):
                entry.files.append(
                    ClaimDocument(
                        client_id=file["id"],
                        title=file["title"][:300],
                        kind=file["kind"][:120],
                        lines=file["lines"],
                        position=file_index,
                    )
                )
            row.claims.append(entry)
        matter.sides.append(row)
        return row

    async def load(self, matter_id: str) -> dict | None:
        matter = await self._matter(matter_id)
        return None if matter is None else _assemble(matter)

    async def save_position(self, matter_id: str, step: str, owner: str | None) -> dict | None:
        matter = await self._matter(matter_id)
        if matter is None:
            return None
        matter.step = step
        matter.owner = owner
        return await self._saved(matter)

    async def save_header(self, matter_id: str, owner: str, header: dict) -> dict | None:
        matter = await self._matter(matter_id)
        side = None if matter is None else self._side(matter, owner)
        if matter is None or side is None:
            return None
        fields = _header(header)
        side.name = fields["name"]
        side.other_name = fields["otherName"]
        side.amount = fields["amount"]
        side.wants = fields["wants"]
        side.private_gaps = fields["privateGaps"]
        side.disputes = fields["disputes"]
        return await self._saved(matter)

    async def create_claim(self, matter_id: str, owner: str, claim: dict) -> dict | None:
        matter = await self._matter(matter_id)
        side = None if matter is None else self._side(matter, owner)
        if matter is None or side is None or not claim.get("id"):
            return None
        entry = self._entry(side, str(claim["id"]))
        if entry is None:
            entry = ClaimEntry(
                side=side,
                client_id=str(claim["id"]),
                text=str(claim.get("text") or ""),
                claim_date=str(claim.get("date") or ""),
                position=len(side.claims),
            )
            self.db.add(entry)
        else:
            entry.text = str(claim.get("text") or "")
            entry.claim_date = str(claim.get("date") or "")
        return await self._saved(matter)

    async def update_claim(self, matter_id: str, owner: str, claim_id: str, patch: dict) -> dict | None:
        matter = await self._matter(matter_id)
        side = None if matter is None else self._side(matter, owner)
        entry = None if side is None else self._entry(side, claim_id)
        if matter is None or entry is None:
            return None
        if patch.get("text") is not None:
            entry.text = str(patch["text"])
        if patch.get("date") is not None:
            entry.claim_date = str(patch["date"])
        return await self._saved(matter)

    async def delete_claim(self, matter_id: str, owner: str, claim_id: str) -> dict | None:
        matter = await self._matter(matter_id)
        side = None if matter is None else self._side(matter, owner)
        entry = None if side is None else self._entry(side, claim_id)
        if matter is None or side is None or entry is None:
            return None
        await self.db.delete(entry)
        return await self._saved(matter)

    async def create_file(self, matter_id: str, owner: str, claim_id: str, file: dict) -> dict | None:
        matter = await self._matter(matter_id)
        side = None if matter is None else self._side(matter, owner)
        entry = None if side is None else self._entry(side, claim_id)
        if matter is None or entry is None or not file.get("id"):
            return None
        file_id = str(file["id"])
        document = next((item for item in entry.files if item.client_id == file_id), None)
        lines = _strings(file.get("lines"))
        if document is None:
            self.db.add(
                ClaimDocument(
                    entry=entry,
                    client_id=file_id,
                    title=str(file.get("title") or "")[:300],
                    kind=str(file.get("kind") or "")[:120],
                    lines=lines,
                    position=len(entry.files),
                )
            )
        else:
            document.title = str(file.get("title") or "")[:300]
            document.kind = str(file.get("kind") or "")[:120]
            document.lines = lines
        return await self._saved(matter)

    async def delete_file(self, matter_id: str, owner: str, claim_id: str, file_id: str) -> dict | None:
        matter = await self._matter(matter_id)
        side = None if matter is None else self._side(matter, owner)
        entry = None if side is None else self._entry(side, claim_id)
        if matter is None or entry is None:
            return None
        document = next((item for item in entry.files if item.client_id == file_id), None)
        if document is None:
            return None
        await self.db.delete(document)
        return await self._saved(matter)
