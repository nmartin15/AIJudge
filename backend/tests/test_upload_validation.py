import uuid

import api.cases as cases_api


async def _fake_get_owned_case(*args, **kwargs):
    return object()


def test_add_evidence_rejects_unsupported_extension(client, monkeypatch, session_header):
    monkeypatch.setattr(cases_api, "get_owned_case", _fake_get_owned_case)

    response = client.post(
        f"/cases/{uuid.uuid4()}/evidence",
        headers=session_header,
        data={
            "submitted_by": "plaintiff",
            "evidence_type": "document",
            "title": "Fake attachment",
            "description": "",
        },
        files={"file": ("payload.exe", b"abc", "application/octet-stream")},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "bad_request"
    assert payload["error"]["message"] == "Unsupported file type"
    assert payload["error"]["retryable"] is False


def test_add_evidence_rejects_oversized_file(client, monkeypatch, session_header):
    monkeypatch.setattr(cases_api, "get_owned_case", _fake_get_owned_case)
    payload = b"a" * ((10 * 1024 * 1024) + 1)

    response = client.post(
        f"/cases/{uuid.uuid4()}/evidence",
        headers=session_header,
        data={
            "submitted_by": "plaintiff",
            "evidence_type": "document",
            "title": "Large file",
            "description": "",
        },
        files={"file": ("large.txt", payload, "text/plain")},
    )

    assert response.status_code == 413
    payload = response.json()
    assert payload["error"]["code"] == "payload_too_large"
    assert "File too large" in payload["error"]["message"]
    assert payload["error"]["retryable"] is False
