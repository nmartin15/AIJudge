"""Tests for 409 Conflict enforcement on party and hearing uniqueness.

Covers:
- Adding duplicate plaintiff returns 409 party_exists
- Adding duplicate defendant returns 409 party_exists
- Starting a second hearing returns 409 hearing_exists
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from db.connection import get_db
from main import app
from models.database import (
    Case,
    CaseStatus,
    CaseType,
    Hearing,
    Party,
    PartyRole,
    Session,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def session_id():
    return str(uuid.uuid4())


@pytest.fixture()
def case_id():
    return uuid.uuid4()


@pytest.fixture()
def headers(session_id):
    return {"X-Session-Id": session_id}


def _make_case(case_id: uuid.UUID, session_id: str) -> MagicMock:
    c = MagicMock(spec=Case)
    c.id = case_id
    c.session_id = uuid.UUID(session_id)
    c.status = CaseStatus.intake
    c.case_type = CaseType.contract
    c.plaintiff_narrative = "Test"
    c.defendant_narrative = "Test"
    c.claimed_amount = 500
    c.parties = []
    c.evidence = []
    c.timeline_events = []
    return c


def _make_db_for_party_duplicate(mock_case, existing_party):
    """Build an AsyncMock DB where get_owned_case succeeds, party check finds duplicate.

    Call order:
    1. get_owned_case → select Case
    2. _touch_session_activity → UPDATE sessions
    3. add_party → select Party (duplicate check)
    """
    db = AsyncMock()
    case_result = MagicMock()
    case_result.scalar_one_or_none.return_value = mock_case

    activity_result = MagicMock()  # _touch_session_activity UPDATE

    party_result = MagicMock()
    party_result.scalar_one_or_none.return_value = existing_party

    db.execute = AsyncMock(side_effect=[case_result, activity_result, party_result])
    return db


def _make_db_for_hearing_duplicate(mock_case, existing_hearing):
    """Build an AsyncMock DB where get_owned_case succeeds, hearing check finds duplicate.

    Call order:
    1. get_owned_case → select Case (with selectinload for parties)
    2. _touch_session_activity → UPDATE sessions
    3. start_hearing → select Hearing (duplicate check)
    """
    db = AsyncMock()
    case_result = MagicMock()
    case_result.scalar_one_or_none.return_value = mock_case
    case_result.scalar_one.return_value = mock_case

    activity_result = MagicMock()

    hearing_result = MagicMock()
    hearing_result.scalar_one_or_none.return_value = existing_hearing

    db.execute = AsyncMock(side_effect=[case_result, activity_result, hearing_result])
    return db


# ─── Party Duplicate Tests ────────────────────────────────────────────────────


class TestPartyDuplicate:
    def test_duplicate_plaintiff_returns_409(self, session_id, case_id, headers):
        mock_case = _make_case(case_id, session_id)
        existing_plaintiff = MagicMock(spec=Party)
        existing_plaintiff.id = uuid.uuid4()
        existing_plaintiff.role = PartyRole.plaintiff
        existing_plaintiff.name = "Alice"

        async def override_get_db():
            yield _make_db_for_party_duplicate(mock_case, existing_plaintiff)

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.post(
                    f"/cases/{case_id}/parties",
                    json={"role": "plaintiff", "name": "Alice Clone"},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 409
        body = response.json()
        assert body["error"]["code"] == "party_exists"
        assert "plaintiff" in body["error"]["message"].lower()

    def test_duplicate_defendant_returns_409(self, session_id, case_id, headers):
        mock_case = _make_case(case_id, session_id)
        existing_defendant = MagicMock(spec=Party)
        existing_defendant.id = uuid.uuid4()
        existing_defendant.role = PartyRole.defendant
        existing_defendant.name = "Bob"

        async def override_get_db():
            yield _make_db_for_party_duplicate(mock_case, existing_defendant)

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.post(
                    f"/cases/{case_id}/parties",
                    json={"role": "defendant", "name": "Bob Clone"},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 409
        body = response.json()
        assert body["error"]["code"] == "party_exists"
        assert "defendant" in body["error"]["message"].lower()


# ─── Hearing Duplicate Tests ─────────────────────────────────────────────────


class TestHearingDuplicate:
    def test_duplicate_hearing_returns_409(self, session_id, case_id, headers):
        mock_case = _make_case(case_id, session_id)
        existing_hearing = MagicMock(spec=Hearing)
        existing_hearing.id = uuid.uuid4()
        existing_hearing.case_id = case_id
        existing_hearing.archetype_id = "stern"

        async def override_get_db():
            yield _make_db_for_hearing_duplicate(mock_case, existing_hearing)

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.post(
                    f"/cases/{case_id}/hearing",
                    json={"archetype_id": "stern"},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 409
        body = response.json()
        assert body["error"]["code"] == "hearing_exists"
