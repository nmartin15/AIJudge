import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from db.connection import get_db
from main import app
from models.database import OperatorRole, Session


class _ScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class _ExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _ScalarResult(self._values)

    def all(self):
        return list(self._values)


class _FakeDB:
    def __init__(self):
        self.sessions: dict[uuid.UUID, Session] = {}

    async def execute(self, *args, **kwargs):
        stmt = args[0] if args else None
        if stmt is not None and hasattr(stmt, "is_dml") and stmt.is_dml:
            return _ExecuteResult([])
        # Corpus stats: GROUP BY source_type → (source_type, count) rows
        return _ExecuteResult([("statute", 1), ("rule", 2)])

    async def get(self, model, identity):
        if model is Session:
            return self.sessions.get(identity)
        return None

    def add(self, obj):
        if isinstance(obj, Session):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.role is None:
                obj.role = OperatorRole.viewer
            if obj.created_at is None:
                obj.created_at = datetime.now(timezone.utc)
            self.sessions[obj.id] = obj

    async def flush(self, *args, **kwargs):
        return None

    async def refresh(self, *args, **kwargs):
        return None


def _make_client(fake_db: _FakeDB) -> TestClient:
    async def override_get_db():
        yield fake_db

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_auth_and_admin_corpus_flow(monkeypatch):
    fake_db = _FakeDB()
    monkeypatch.setattr(
        "api.security.get_settings",
        lambda: SimpleNamespace(admin_api_keys=["integration-admin-key"], debug=True),
    )

    with _make_client(fake_db) as client:
        created = client.post("/sessions")
        assert created.status_code == 200
        session = created.json()
        session_id = session["id"]
        assert session["role"] == "viewer"

        me_viewer = client.get("/auth/me", headers={"X-Session-Id": session_id})
        assert me_viewer.status_code == 200
        assert me_viewer.json()["role"] == "viewer"
        assert me_viewer.json()["is_admin"] is False

        denied = client.get("/corpus/stats", headers={"X-Session-Id": session_id})
        assert denied.status_code == 403
        denied_body = denied.json()
        denied_message = denied_body.get("detail") or denied_body.get("error", {}).get("message")
        assert denied_message == "Admin role required"

        login = client.post(
            "/auth/admin-login",
            headers={"X-Session-Id": session_id},
            json={"admin_key": "integration-admin-key"},
        )
        assert login.status_code == 200
        assert login.json()["role"] == "admin"

        me_admin = client.get("/auth/me", headers={"X-Session-Id": session_id})
        assert me_admin.status_code == 200
        assert me_admin.json()["role"] == "admin"
        assert me_admin.json()["is_admin"] is True

        stats = client.get("/corpus/stats", headers={"X-Session-Id": session_id})
        assert stats.status_code == 200
        assert stats.json() == {
            "total_chunks": 3,
            "by_source_type": {"statute": 1, "rule": 2},
        }

    app.dependency_overrides.clear()


def test_corpus_search_requires_admin_role(monkeypatch):
    fake_db = _FakeDB()
    monkeypatch.setattr(
        "api.security.get_settings",
        lambda: SimpleNamespace(admin_api_keys=["integration-admin-key"], debug=True),
    )

    with _make_client(fake_db) as client:
        session_id = client.post("/sessions").json()["id"]
        response = client.post(
            "/corpus/search",
            headers={"X-Session-Id": session_id},
            json={"query": "security deposit", "limit": 3},
        )
        assert response.status_code == 403
        response_body = response.json()
        response_message = response_body.get("detail") or response_body.get("error", {}).get("message")
        assert response_message == "Admin role required"

    app.dependency_overrides.clear()
