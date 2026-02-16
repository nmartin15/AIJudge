"""Tests for the HTTP fallback hearing message endpoint.

Covers:
- POST /cases/{case_id}/hearing/message returns judge response
- Missing hearing returns 404
- Concluded hearing returns 400
- Conclusion detection propagates correctly
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
    HearingMessage,
    HearingMessageRole,
    Party,
    Session,
)
from services.hearing_service import JudgeExchangeResult


@pytest.fixture()
def session_id():
    return str(uuid.uuid4())


@pytest.fixture()
def case_id():
    return uuid.uuid4()


@pytest.fixture()
def hearing_id():
    return uuid.uuid4()


@pytest.fixture()
def headers(session_id):
    return {"X-Session-Id": session_id}


def _make_case(case_id, session_id):
    c = MagicMock(spec=Case)
    c.id = case_id
    c.session_id = uuid.UUID(session_id)
    c.status = CaseStatus.HEARING
    c.case_type = CaseType.CONTRACT
    c.parties = []
    return c


def _make_hearing(hearing_id, case_id, completed=False):
    h = MagicMock(spec=Hearing)
    h.id = hearing_id
    h.case_id = case_id
    h.archetype_id = "stern"
    h.completed_at = "2024-01-01T00:00:00" if completed else None
    h.messages = []
    return h


def _noop_result():
    """Dummy result for _touch_session_activity UPDATE."""
    return MagicMock()


# ─── Success Case ─────────────────────────────────────────────────────────────


class TestHearingHTTPMessage:
    @patch("api.hearing.process_hearing_exchange")
    def test_post_message_returns_judge_response(
        self, mock_exchange, session_id, case_id, hearing_id, headers
    ):
        mock_case = _make_case(case_id, session_id)
        mock_hearing = _make_hearing(hearing_id, case_id)

        mock_exchange.return_value = JudgeExchangeResult(
            judge_content="The court acknowledges your statement.",
            judge_sequence=4,
            concluded=False,
        )

        async def override_get_db():
            db = AsyncMock()
            case_result = MagicMock()
            case_result.scalar_one_or_none.return_value = mock_case
            case_result.scalar_one.return_value = mock_case

            hearing_result = MagicMock()
            hearing_result.scalar_one_or_none.return_value = mock_hearing

            # Call order:
            # 1. get_owned_case → select Case
            # 2. _touch_session_activity → UPDATE
            # 3. select Hearing
            # 4. select Case with parties (for case_context)
            db.execute = AsyncMock(side_effect=[
                case_result,     # get_owned_case
                _noop_result(),  # _touch_session_activity
                hearing_result,  # select Hearing
                case_result,     # select Case with parties
            ])
            yield db

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.post(
                    f"/cases/{case_id}/hearing/message",
                    json={"role": "plaintiff", "content": "My testimony."},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        body = response.json()
        assert body["judge_message"]["role"] == "judge"
        assert body["judge_message"]["content"] == "The court acknowledges your statement."
        assert body["judge_message"]["sequence"] == 4
        assert body["hearing_concluded"] is False

    @patch("api.hearing.process_hearing_exchange")
    def test_conclusion_propagated(
        self, mock_exchange, session_id, case_id, hearing_id, headers
    ):
        mock_case = _make_case(case_id, session_id)
        mock_hearing = _make_hearing(hearing_id, case_id)

        mock_exchange.return_value = JudgeExchangeResult(
            judge_content="This hearing is now concluded.",
            judge_sequence=6,
            concluded=True,
        )

        async def override_get_db():
            db = AsyncMock()
            case_result = MagicMock()
            case_result.scalar_one_or_none.return_value = mock_case
            case_result.scalar_one.return_value = mock_case
            hearing_result = MagicMock()
            hearing_result.scalar_one_or_none.return_value = mock_hearing
            db.execute = AsyncMock(side_effect=[
                case_result, _noop_result(), hearing_result, case_result,
            ])
            yield db

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.post(
                    f"/cases/{case_id}/hearing/message",
                    json={"role": "plaintiff", "content": "Final words."},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["hearing_concluded"] is True


# ─── Error Cases ──────────────────────────────────────────────────────────────


class TestHearingHTTPErrors:
    def test_no_hearing_returns_404(self, session_id, case_id, headers):
        mock_case = _make_case(case_id, session_id)

        async def override_get_db():
            db = AsyncMock()
            case_result = MagicMock()
            case_result.scalar_one_or_none.return_value = mock_case
            hearing_result = MagicMock()
            hearing_result.scalar_one_or_none.return_value = None
            db.execute = AsyncMock(side_effect=[
                case_result, _noop_result(), hearing_result,
            ])
            yield db

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.post(
                    f"/cases/{case_id}/hearing/message",
                    json={"role": "plaintiff", "content": "Hello?"},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "hearing_not_found"

    def test_concluded_hearing_returns_400(
        self, session_id, case_id, hearing_id, headers
    ):
        mock_case = _make_case(case_id, session_id)
        mock_hearing = _make_hearing(hearing_id, case_id, completed=True)

        async def override_get_db():
            db = AsyncMock()
            case_result = MagicMock()
            case_result.scalar_one_or_none.return_value = mock_case
            hearing_result = MagicMock()
            hearing_result.scalar_one_or_none.return_value = mock_hearing
            db.execute = AsyncMock(side_effect=[
                case_result, _noop_result(), hearing_result,
            ])
            yield db

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as client:
                response = client.post(
                    f"/cases/{case_id}/hearing/message",
                    json={"role": "defendant", "content": "But I have more to say!"},
                    headers=headers,
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "hearing_concluded"

    def test_missing_session_returns_401(self, case_id):
        with TestClient(app) as client:
            response = client.post(
                f"/cases/{case_id}/hearing/message",
                json={"role": "plaintiff", "content": "Hello"},
            )
        assert response.status_code == 401
