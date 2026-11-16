"""The claim track stores a record and hides the other person's private gaps."""

from fastapi.testclient import TestClient

from api.claim_track import get_claim_store
from main import app
from services.claim_track import MemoryClaimStore


def _body() -> dict:
    return {
        "step": "submit-alex",
        "owner": "alex",
        "sides": {
            "alex": {
                "owner": "alex",
                "name": "Alex Rivera",
                "amount": "1500",
                "wants": "The deposit.",
                "claims": [{"id": "deposit", "text": "I paid it.", "date": "2024-06-01", "files": []}],
                "privateGaps": ["Your own photos of the carpet on move-out day"],
                "disputes": [],
            },
            "jordan": {
                "owner": "jordan",
                "name": "Jordan Hale",
                "amount": "1500",
                "wants": "Keep it.",
                "claims": [],
                "privateGaps": ["Itemized list of deductions, sent within 30 days of move-out"],
                "disputes": [],
            },
        },
    }


def _auth(client: TestClient, email: str, password: str) -> dict[str, str]:
    logged = client.post("/claim-access", json={"email": email, "password": password})
    assert logged.status_code == 200
    return {"Authorization": f"Bearer {logged.json()['token']}"}


def test_server_keeps_the_claim_and_hides_the_other_gap(client: TestClient):
    memory = MemoryClaimStore()

    async def override_store():
        return memory

    app.dependency_overrides[get_claim_store] = override_store
    alex = _auth(client, "alex.rivera@demo.wy", "deposit1500")
    assert client.post("/claim-matters", json=_body()).status_code == 401
    created = client.post("/claim-matters", json=_body(), headers=alex)
    assert created.status_code == 200
    matter_id = created.json()["id"]
    assert created.json()["sides"]["jordan"]["privateGaps"] == []
    assert created.json()["sides"]["alex"]["privateGaps"]

    assert memory.rows[matter_id]["sides"]["jordan"]["privateGaps"] == []
    jordan = _auth(client, "jordan.hale@demo.wy", "carpet1500")
    kept = client.patch(
        f"/claim-matters/{matter_id}/sides/jordan",
        headers=jordan,
        json={
            "name": "Jordan Hale",
            "otherName": "Alex Rivera",
            "amount": "1500",
            "wants": "Keep it.",
            "privateGaps": ["Itemized list of deductions, sent within 30 days of move-out"],
            "disputes": [],
        },
    )
    assert kept.status_code == 200
    refused = client.post(
        f"/claim-matters/{matter_id}/sides/jordan/claims",
        headers=alex,
        json={"id": "nope", "text": "Alex writing Jordan's claim.", "date": "2026-11-16"},
    )
    assert refused.status_code == 403

    fetched = client.get(f"/claim-matters/{matter_id}", headers=jordan)
    assert fetched.status_code == 200
    assert fetched.json()["sides"]["alex"]["privateGaps"] == []
    assert "Itemized list" in fetched.json()["sides"]["jordan"]["privateGaps"][0]
    assert fetched.json()["sides"]["alex"]["claims"][0]["date"] == "2024-06-01"
    alex_view = client.get(f"/claim-matters/{matter_id}", headers=alex)
    assert alex_view.json()["sides"]["jordan"]["privateGaps"] == []

    saved = client.patch(
        f"/claim-matters/{matter_id}/sides/alex/claims/deposit",
        headers=alex,
        json={"text": "I paid it on June 1.", "date": "2024-06-01"},
    )
    assert saved.status_code == 200
    assert saved.json()["sides"]["alex"]["claims"][0]["text"] == "I paid it on June 1."
    jordan_view = client.get(f"/claim-matters/{matter_id}", headers=jordan)
    assert "Itemized list" in jordan_view.json()["sides"]["jordan"]["privateGaps"][0]


def test_a_claim_and_a_file_are_separate_records(client: TestClient):
    memory = MemoryClaimStore()

    async def override_store():
        return memory

    app.dependency_overrides[get_claim_store] = override_store
    alex = _auth(client, "alex.rivera@demo.wy", "deposit1500")
    created = client.post("/claim-matters", json=_body(), headers=alex)
    matter_id = created.json()["id"]

    added = client.post(
        f"/claim-matters/{matter_id}/sides/alex/claims",
        headers=alex,
        json={"id": "added-1", "text": "A later claim.", "date": "2026-11-16"},
    )
    assert added.status_code == 200
    filed = client.post(
        f"/claim-matters/{matter_id}/sides/alex/claims/added-1/files",
        headers=alex,
        json={"id": "note", "title": "Note.txt", "kind": "text/plain", "lines": ["Second document."]},
    )
    assert filed.status_code == 200
    claims = filed.json()["sides"]["alex"]["claims"]
    assert claims[1]["date"] == "2026-11-16"
    assert claims[1]["files"][0]["title"] == "Note.txt"
    assert claims[0]["date"] == "2024-06-01"

    removed = client.delete(f"/claim-matters/{matter_id}/sides/alex/claims/added-1/files/note", headers=alex)
    assert removed.status_code == 200
    assert removed.json()["sides"]["alex"]["claims"][1]["files"] == []
    jordan = client.get(f"/claim-matters/{matter_id}", headers=_auth(client, "jordan.hale@demo.wy", "carpet1500"))
    assert jordan.json()["sides"]["jordan"]["privateGaps"] == []
    assert jordan.json()["sides"]["alex"]["privateGaps"] == []


def test_the_reading_comes_from_the_saved_file(client: TestClient):
    memory = MemoryClaimStore()

    async def override_store():
        return memory

    app.dependency_overrides[get_claim_store] = override_store
    alex = _auth(client, "alex.rivera@demo.wy", "deposit1500")
    created = client.post("/claim-matters", json=_body(), headers=alex)
    matter_id = created.json()["id"]
    reading = client.get(f"/claim-matters/{matter_id}/reading", headers=alex)
    assert reading.status_code == 200
    body = reading.json()
    assert "1,500" in body["outcome"]
    assert body["statute"]["citation"] == "W.S. 1-21-1208"
    assert "full deposit and court costs" in body["statute"]["paragraphs"][1]
    dumped = str(body)
    assert "Your own photos" not in dumped
    assert "Itemized list" not in dumped
    assert client.get(f"/claim-matters/{matter_id}/reading").status_code == 401


def test_amount_over_cap_is_refused(client: TestClient):
    memory = MemoryClaimStore()

    async def override_store():
        return memory

    app.dependency_overrides[get_claim_store] = override_store
    alex = _auth(client, "alex.rivera@demo.wy", "deposit1500")
    body = _body()
    body["sides"]["alex"]["amount"] = "6001"
    response = client.post("/claim-matters", json=body, headers=alex)
    assert response.status_code == 422
    assert memory.rows == {}
