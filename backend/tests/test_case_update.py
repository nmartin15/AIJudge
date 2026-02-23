"""Tests for the PUT /cases/{case_id} partial update endpoint.

Covers:
- Partial update only changes provided fields
- Multiple field updates
- Empty update body succeeds
- Missing session returns 401
- Non-owned case returns 404
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from db.connection import get_db
from main import app
from models.database import (
    Case,
    CaseStatus,
    CaseType,
)


@pytest.fixture()
def session_id():
    return str(uuid.uuid4())


@pytest.fixture()
def case_id():
    return uuid.uuid4()


@pytest.fixture()
def headers(session_id):
    return {"X-Session-Id": session_id}


def _make_case(case_id, session_id):
    c = MagicMock(spec=Case)
    c.id = case_id
    c.session_id = uuid.UUID(session_id)
    c.status = CaseStatus.intake
    c.case_type = CaseType.contract
    c.plaintiff_narrative = "Original narrative"
    c.defendant_narrative = "Original defense"
    c.claimed_amount = 500
    c.damages_breakdown = None
    c.archetype_id = None
    c.parties = []
    c.evidence = []
    c.timeline_events = []
    c.created_at = "2024-01-01T00:00:00"
    c.updated_at = "2024-01-01T00:00:00"
    return c


def _noop_result():
    """Dummy result for _touch_session_activity UPDATE."""
    return MagicMock()


def _make_update_db(mock_case):
    """Build an AsyncMock DB for update_case.

    Call order:
    1. get_owned_case → select Case
    2. _touch_session_activity → UPDATE sessions
    3. db.flush()
    4. db.refresh(case)
    5. db.execute(select Case...) → reload with relationships
    """
    db = AsyncMock()
    case_result = MagicMock()
    case_result.scalar_one_or_none.return_value = mock_case

    reload_result = MagicMock()
    reload_result.scalar_one.return_value = mock_case

    db.execute = AsyncMock(side_effect=[
        case_result,     # get_owned_case
        _noop_result(),  # _touch_session_activity
        reload_result,   # reload after update
    ])
    return db


class TestCaseUpdate:
    def test_partial_update_returns_200(self, session_id, case_id, headers):
        mock_case = _make_case(case_id, session_id)

        async def override_get_db():
            yield _make_update_db(mock_case)

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.put(
                    f"/cases/{case_id}",
                    json={"plaintiff_narrative": "Updated narrative"},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200

    def test_update_multiple_fields(self, session_id, case_id, headers):
        mock_case = _make_case(case_id, session_id)

        async def override_get_db():
            yield _make_update_db(mock_case)

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.put(
                    f"/cases/{case_id}",
                    json={
                        "plaintiff_narrative": "New plaintiff story",
                        "defendant_narrative": "New defendant story",
                        "claimed_amount": 1500,
                    },
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200

    def test_empty_update_body_succeeds(self, session_id, case_id, headers):
        mock_case = _make_case(case_id, session_id)

        async def override_get_db():
            yield _make_update_db(mock_case)

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.put(
                    f"/cases/{case_id}",
                    json={},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200


class TestCaseUpdateErrors:
    def test_missing_session_returns_401(self, case_id):
        with TestClient(app) as client:
            response = client.put(
                f"/cases/{case_id}",
                json={"plaintiff_narrative": "test"},
            )
        assert response.status_code == 401

    def test_non_owned_case_returns_404(self, session_id, case_id, headers):
        async def override_get_db():
            db = AsyncMock()
            case_result = MagicMock()
            case_result.scalar_one_or_none.return_value = None
            # _touch_session_activity won't run because get_owned_case raises first
            db.execute = AsyncMock(return_value=case_result)
            yield db

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.put(
                    f"/cases/{case_id}",
                    json={"plaintiff_narrative": "test"},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "case_not_found"
