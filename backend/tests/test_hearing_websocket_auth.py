import uuid

import pytest
from starlette.websockets import WebSocketDisconnect

import api.hearing as hearing_api


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    async def execute(self, *args, **kwargs):
        # First query in websocket handler checks for Hearing by case_id.
        # Returning None triggers an error payload and graceful close.
        return _FakeResult(None)


class _FakeSessionContext:
    async def __aenter__(self):
        return _FakeDB()

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _fake_async_session_local():
    return _FakeSessionContext()


def test_hearing_websocket_rejects_missing_session_header(client):
    case_id = uuid.uuid4()

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/cases/{case_id}/hearing/ws"):
            pass

    assert exc_info.value.code == 4401


def test_hearing_websocket_accepts_authenticated_handshake(client, monkeypatch, session_header):
    monkeypatch.setattr(hearing_api, "AsyncSessionLocal", _fake_async_session_local)
    case_id = uuid.uuid4()

    with client.websocket_connect(
        f"/cases/{case_id}/hearing/ws",
        headers=session_header,
    ) as websocket:
        payload = websocket.receive_json()
        assert payload == {"error": "No hearing found"}
