import uuid


def test_get_case_requires_session_header(client):
    response = client.get(f"/cases/{uuid.uuid4()}")

    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "unauthorized"
    assert payload["error"]["message"] == "X-Session-Id header is required"
    assert payload["error"]["retryable"] is False
