"""Tests for services/hearing_service.py — shared hearing business logic.

Covers:
- build_case_context() with various party configurations
- extract_party_names() defaults and overrides
- get_next_sequence() with empty and populated hearings
- process_hearing_exchange() end-to-end with mocked DB and LLM
- Conclusion detection via the CONCLUSION_MARKER sentinel
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.database import (
    Case,
    CaseType,
    Hearing,
    HearingMessage,
    HearingMessageRole,
    Party,
    PartyRole,
)
from services.hearing_service import (
    CONCLUSION_MARKER,
    JudgeExchangeResult,
    build_case_context,
    extract_party_names,
    get_next_sequence,
    process_hearing_exchange,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_party(role: PartyRole, name: str) -> MagicMock:
    p = MagicMock(spec=Party)
    p.role = role
    p.name = name
    return p


def _make_case(
    case_type=CaseType.contract,
    plaintiff_narrative="I was wronged.",
    defendant_narrative="I did nothing wrong.",
    claimed_amount=500,
    parties=None,
) -> MagicMock:
    c = MagicMock(spec=Case)
    c.case_type = case_type
    c.plaintiff_narrative = plaintiff_narrative
    c.defendant_narrative = defendant_narrative
    c.claimed_amount = claimed_amount
    c.parties = parties or []
    return c


# ─── build_case_context ──────────────────────────────────────────────────────


class TestBuildCaseContext:
    def test_basic_context_with_both_parties(self):
        plaintiff = _make_party(PartyRole.plaintiff, "Alice")
        defendant = _make_party(PartyRole.defendant, "Bob")
        case = _make_case(parties=[plaintiff, defendant])

        ctx = build_case_context(case, [plaintiff, defendant])

        assert ctx["case_type"] == "contract"
        assert ctx["plaintiff_name"] == "Alice"
        assert ctx["defendant_name"] == "Bob"
        assert ctx["plaintiff_narrative"] == "I was wronged."
        assert ctx["defendant_narrative"] == "I did nothing wrong."
        assert ctx["claimed_amount"] == 500.0

    def test_default_names_when_no_parties(self):
        case = _make_case()
        ctx = build_case_context(case, [])

        assert ctx["plaintiff_name"] == "Plaintiff"
        assert ctx["defendant_name"] == "Defendant"

    def test_only_plaintiff_provided(self):
        plaintiff = _make_party(PartyRole.plaintiff, "Alice")
        case = _make_case()
        ctx = build_case_context(case, [plaintiff])

        assert ctx["plaintiff_name"] == "Alice"
        assert ctx["defendant_name"] == "Defendant"

    def test_null_case_type_defaults_to_unknown(self):
        case = _make_case(case_type=None)
        ctx = build_case_context(case, [])
        assert ctx["case_type"] == "unknown"

    def test_null_narratives_default_to_empty_string(self):
        case = _make_case(plaintiff_narrative=None, defendant_narrative=None)
        ctx = build_case_context(case, [])
        assert ctx["plaintiff_narrative"] == ""
        assert ctx["defendant_narrative"] == ""

    def test_null_claimed_amount_defaults_to_zero(self):
        case = _make_case(claimed_amount=None)
        ctx = build_case_context(case, [])
        assert ctx["claimed_amount"] == 0


# ─── extract_party_names ─────────────────────────────────────────────────────


class TestExtractPartyNames:
    def test_extracts_both_names(self):
        plaintiff = _make_party(PartyRole.plaintiff, "Alice")
        defendant = _make_party(PartyRole.defendant, "Bob")
        case = _make_case(parties=[plaintiff, defendant])

        p_name, d_name = extract_party_names(case)
        assert p_name == "Alice"
        assert d_name == "Bob"

    def test_defaults_when_no_parties(self):
        case = _make_case(parties=[])
        p_name, d_name = extract_party_names(case)
        assert p_name == "Plaintiff"
        assert d_name == "Defendant"


# ─── get_next_sequence ────────────────────────────────────────────────────────


class TestGetNextSequence:
    async def test_returns_zero_for_empty_hearing(self):
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar.return_value = None
        db.execute.return_value = result_mock

        seq = await get_next_sequence(db, uuid.uuid4())
        assert seq == 0

    async def test_returns_max_sequence(self):
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar.return_value = 5
        db.execute.return_value = result_mock

        seq = await get_next_sequence(db, uuid.uuid4())
        assert seq == 5


# ─── process_hearing_exchange ─────────────────────────────────────────────────


class TestProcessHearingExchange:
    @pytest.fixture()
    def hearing_id(self):
        return uuid.uuid4()

    @pytest.fixture()
    def case_context(self):
        return {
            "case_type": "contract",
            "plaintiff_name": "Alice",
            "defendant_name": "Bob",
            "plaintiff_narrative": "I was wronged.",
            "defendant_narrative": "I did nothing wrong.",
            "claimed_amount": 500.0,
        }

    @pytest.fixture()
    def mock_db(self):
        """Async DB session mock with realistic execute behavior."""
        db = AsyncMock()

        # First execute: get_next_sequence → returns max seq
        seq_result = MagicMock()
        seq_result.scalar.return_value = 2

        # Second execute: fetch conversation history
        msg1 = MagicMock()
        msg1.role = HearingMessageRole.judge
        msg1.content = "Opening statement"
        msg1.sequence = 1

        msg2 = MagicMock()
        msg2.role = HearingMessageRole.plaintiff
        msg2.content = "My argument"
        msg2.sequence = 2

        msg3 = MagicMock()
        msg3.role = HearingMessageRole.plaintiff
        msg3.content = "Additional details"
        msg3.sequence = 3

        history_result = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = [msg1, msg2, msg3]
        history_result.scalars.return_value = scalars_mock

        db.execute.side_effect = [seq_result, history_result]
        db.get.return_value = MagicMock(spec=Hearing)

        return db

    @patch("services.hearing_service.generate_hearing_message")
    async def test_basic_exchange(
        self, mock_generate, mock_db, hearing_id, case_context
    ):
        mock_generate.return_value = {"content": "I have a question for the plaintiff."}

        result = await process_hearing_exchange(
            mock_db,
            hearing_id=hearing_id,
            archetype_id="stern",
            case_context=case_context,
            user_role=HearingMessageRole.plaintiff,
            user_content="Here is my testimony.",
        )

        assert isinstance(result, JudgeExchangeResult)
        assert result.judge_content == "I have a question for the plaintiff."
        assert result.judge_sequence == 4  # max_seq(2) + 2
        assert result.concluded is False

        # Verify user message was added to DB
        assert mock_db.add.call_count == 2  # user msg + judge msg
        assert mock_db.flush.called

    @patch("services.hearing_service.generate_hearing_message")
    async def test_conclusion_detected(
        self, mock_generate, mock_db, hearing_id, case_context
    ):
        mock_generate.return_value = {
            "content": "Thank you both. This hearing is now concluded."
        }

        result = await process_hearing_exchange(
            mock_db,
            hearing_id=hearing_id,
            archetype_id="stern",
            case_context=case_context,
            user_role=HearingMessageRole.plaintiff,
            user_content="Final statement.",
        )

        assert result.concluded is True
        # The hearing object's completed_at should have been set
        hearing_obj = await mock_db.get(Hearing, hearing_id)
        assert hearing_obj.completed_at is not None

    @patch("services.hearing_service.generate_hearing_message")
    async def test_conclusion_case_insensitive(
        self, mock_generate, mock_db, hearing_id, case_context
    ):
        mock_generate.return_value = {
            "content": "The HEARING IS NOW CONCLUDED. Good day."
        }

        result = await process_hearing_exchange(
            mock_db,
            hearing_id=hearing_id,
            archetype_id="stern",
            case_context=case_context,
            user_role=HearingMessageRole.defendant,
            user_content="My response.",
        )

        assert result.concluded is True

    @patch("services.hearing_service.generate_hearing_message")
    async def test_no_false_conclusion_on_partial_match(
        self, mock_generate, mock_db, hearing_id, case_context
    ):
        mock_generate.return_value = {
            "content": "The hearing will continue after a brief recess."
        }

        result = await process_hearing_exchange(
            mock_db,
            hearing_id=hearing_id,
            archetype_id="stern",
            case_context=case_context,
            user_role=HearingMessageRole.plaintiff,
            user_content="Can we take a break?",
        )

        assert result.concluded is False

    @patch("services.hearing_service.generate_hearing_message")
    async def test_sequence_starts_from_zero(
        self, mock_generate, hearing_id, case_context
    ):
        """When the hearing has no messages yet, sequences should be 1 and 2."""
        db = AsyncMock()

        seq_result = MagicMock()
        seq_result.scalar.return_value = None  # No messages yet

        history_result = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = []
        history_result.scalars.return_value = scalars_mock

        db.execute.side_effect = [seq_result, history_result]
        db.get.return_value = MagicMock(spec=Hearing)

        mock_generate.return_value = {"content": "Opening question."}

        result = await process_hearing_exchange(
            db,
            hearing_id=hearing_id,
            archetype_id="empathetic",
            case_context=case_context,
            user_role=HearingMessageRole.plaintiff,
            user_content="Hello.",
        )

        assert result.judge_sequence == 2  # 0 + 2

    @patch("services.hearing_service.generate_hearing_message")
    async def test_defendant_role_accepted(
        self, mock_generate, mock_db, hearing_id, case_context
    ):
        mock_generate.return_value = {"content": "Noted."}

        result = await process_hearing_exchange(
            mock_db,
            hearing_id=hearing_id,
            archetype_id="stern",
            case_context=case_context,
            user_role=HearingMessageRole.defendant,
            user_content="My defense.",
        )

        assert result.concluded is False
        assert result.judge_content == "Noted."


# ─── CONCLUSION_MARKER constant ──────────────────────────────────────────────


class TestConclusionMarker:
    def test_marker_value(self):
        assert CONCLUSION_MARKER == "hearing is now concluded"

    def test_marker_detected_in_typical_response(self):
        text = "Thank you for your testimony. This hearing is now concluded. A decision will follow."
        assert CONCLUSION_MARKER in text.lower()

    def test_marker_not_in_unrelated_text(self):
        text = "We will continue the hearing after a short recess."
        assert CONCLUSION_MARKER not in text.lower()
