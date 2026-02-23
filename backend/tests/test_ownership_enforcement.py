import uuid


def test_get_case_requires_session_header(client):
    response = client.get(f"/cases/{uuid.uuid4()}")

    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "session_required"
    assert payload["error"]["message"] == "Session identifier is required"
    assert payload["error"]["retryable"] is False
