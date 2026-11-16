"""CRUD for the security-deposit claim page. Not a wizard case.

Create  POST   /claim-matters
Read    GET    /claim-matters/{id}
Update  PATCH  /claim-matters/{id}                         step on the walk
        PATCH  /claim-matters/{id}/sides/{owner}           header fields
        PATCH  /claim-matters/{id}/sides/{owner}/claims/{claim_id}
Delete  DELETE /claim-matters/{id}/sides/{owner}/claims/{claim_id}
Create  POST   /claim-matters/{id}/sides/{owner}/claims
Create  POST   /claim-matters/{id}/sides/{owner}/claims/{claim_id}/files
Delete  DELETE /claim-matters/{id}/sides/{owner}/claims/{claim_id}/files/{file_id}
"""

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.guardrails import api_error
from db.connection import get_db
from services.claim_access import actor_for_login, issue_token, read_token
from services.claim_reading import read_record
from services.claim_track import VIEWERS, ClaimStore, DbClaimStore, amount_over_cap, for_viewer, over_cap

router = APIRouter()


class ClaimLoginBody(BaseModel):
    email: str
    password: str


class ClaimTrackBody(BaseModel):
    step: str = Field(min_length=1, max_length=40)
    owner: str | None = None
    sides: dict


class ClaimPositionBody(BaseModel):
    step: str = Field(min_length=1, max_length=40)
    owner: str | None = None


class SideHeaderBody(BaseModel):
    name: str = ""
    otherName: str = ""
    amount: str = ""
    wants: str = ""
    privateGaps: list[str] = []
    disputes: list[str] = []


class ClaimCreateBody(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    text: str = ""
    date: str = Field(default="", max_length=10)


class ClaimPatchBody(BaseModel):
    text: str | None = None
    date: str | None = Field(default=None, max_length=10)


class FileCreateBody(BaseModel):
    id: str = Field(min_length=1, max_length=400)
    title: str = ""
    kind: str = ""
    lines: list[str] = []


def get_claim_store(db: AsyncSession = Depends(get_db)) -> ClaimStore:
    return DbClaimStore(db)


def require_actor(authorization: str | None = Header(default=None)) -> str:
    """The person saved at login. A name in the URL is not enough."""
    if authorization is None or not authorization.lower().startswith("bearer "):
        raise api_error(status_code=401, code="claim_login_required", message="Log in before opening a claim.")
    actor = read_token(authorization.split(" ", 1)[1].strip())
    if actor is None:
        raise api_error(status_code=401, code="claim_login_required", message="Log in before opening a claim.")
    return actor


def _response(matter_id: str, stored: dict, actor: str) -> dict:
    return {"id": matter_id, **for_viewer(stored, actor)}


def _own(actor: str, owner: str) -> None:
    if owner not in VIEWERS:
        raise api_error(status_code=422, code="claim_viewer", message="Viewer must be alex or jordan.")
    if actor != owner:
        raise api_error(status_code=403, code="claim_not_yours", message="You can only change your own side.")


def _without_other_gaps(sides: dict, actor: str) -> dict:
    kept: dict = {}
    for owner, side in sides.items():
        if not isinstance(side, dict):
            continue
        shown = dict(side)
        if owner != actor:
            shown["privateGaps"] = []
        kept[owner] = shown
    return kept


@router.post("/claim-access")
async def claim_login(body: ClaimLoginBody):
    actor = actor_for_login(body.email, body.password)
    if actor is None:
        raise api_error(status_code=401, code="claim_login_rejected", message="That login is not on this track.")
    return {"owner": actor, "token": issue_token(actor)}


@router.post("/claim-matters")
async def create_claim_matter(
    body: ClaimTrackBody,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    if "alex" not in body.sides or "jordan" not in body.sides:
        raise api_error(
            status_code=422,
            code="claim_sides_required",
            message="A claim record needs Alex's side and Jordan's side.",
        )
    payload = {"step": body.step, "owner": actor, "sides": _without_other_gaps(body.sides, actor)}
    if over_cap(payload):
        raise api_error(status_code=422, code="claim_over_cap", message="This track stops at $6,000.")
    matter_id, saved = await store.create(payload)
    return _response(matter_id, saved, actor)


@router.get("/claim-matters/{matter_id}")
async def read_claim_matter(
    matter_id: str,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    saved = await store.load(matter_id)
    if saved is None:
        raise api_error(status_code=404, code="claim_matter_missing", message="That claim record is not on the server.")
    return _response(matter_id, saved, actor)


@router.patch("/claim-matters/{matter_id}")
async def move_claim_matter(
    matter_id: str,
    body: ClaimPositionBody,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    stored = await store.save_position(matter_id, body.step, actor)
    if stored is None:
        raise api_error(status_code=404, code="claim_matter_missing", message="That claim record is not on the server.")
    return _response(matter_id, stored, actor)


@router.patch("/claim-matters/{matter_id}/sides/{owner}")
async def update_claim_header(
    matter_id: str,
    owner: str,
    body: SideHeaderBody,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    """Update the header on one person's page. Claims and files stay where they are."""
    _own(actor, owner)
    if amount_over_cap(body.amount):
        raise api_error(status_code=422, code="claim_over_cap", message="This track stops at $6,000.")
    stored = await store.save_header(matter_id, owner, body.model_dump())
    if stored is None:
        raise api_error(status_code=404, code="claim_matter_missing", message="That claim record is not on the server.")
    return _response(matter_id, stored, actor)


@router.post("/claim-matters/{matter_id}/sides/{owner}/claims")
async def create_claim(
    matter_id: str,
    owner: str,
    body: ClaimCreateBody,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    _own(actor, owner)
    stored = await store.create_claim(matter_id, owner, body.model_dump())
    if stored is None:
        raise api_error(status_code=404, code="claim_matter_missing", message="That claim record is not on the server.")
    return _response(matter_id, stored, actor)


@router.patch("/claim-matters/{matter_id}/sides/{owner}/claims/{claim_id}")
async def update_claim(
    matter_id: str,
    owner: str,
    claim_id: str,
    body: ClaimPatchBody,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    _own(actor, owner)
    stored = await store.update_claim(matter_id, owner, claim_id, body.model_dump())
    if stored is None:
        raise api_error(status_code=404, code="claim_missing", message="That claim is not on the server.")
    return _response(matter_id, stored, actor)


@router.delete("/claim-matters/{matter_id}/sides/{owner}/claims/{claim_id}")
async def delete_claim(
    matter_id: str,
    owner: str,
    claim_id: str,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    _own(actor, owner)
    stored = await store.delete_claim(matter_id, owner, claim_id)
    if stored is None:
        raise api_error(status_code=404, code="claim_missing", message="That claim is not on the server.")
    return _response(matter_id, stored, actor)


@router.post("/claim-matters/{matter_id}/sides/{owner}/claims/{claim_id}/files")
async def create_claim_file(
    matter_id: str,
    owner: str,
    claim_id: str,
    body: FileCreateBody,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    _own(actor, owner)
    stored = await store.create_file(matter_id, owner, claim_id, body.model_dump())
    if stored is None:
        raise api_error(status_code=404, code="claim_missing", message="That claim is not on the server.")
    return _response(matter_id, stored, actor)


@router.delete("/claim-matters/{matter_id}/sides/{owner}/claims/{claim_id}/files/{file_id}")
async def delete_claim_file(
    matter_id: str,
    owner: str,
    claim_id: str,
    file_id: str,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    _own(actor, owner)
    stored = await store.delete_file(matter_id, owner, claim_id, file_id)
    if stored is None:
        raise api_error(status_code=404, code="claim_file_missing", message="That document is not on the server.")
    return _response(matter_id, stored, actor)


@router.get("/claim-matters/{matter_id}/reading")
async def read_claim_reading(
    matter_id: str,
    actor: str = Depends(require_actor),
    store: ClaimStore = Depends(get_claim_store),
):
    """The reading of the saved file. Either person receives the same text."""
    saved = await store.load(matter_id)
    if saved is None:
        raise api_error(status_code=404, code="claim_matter_missing", message="That claim record is not on the server.")
    reading = read_record(saved)
    reading["reader"] = actor
    return reading
