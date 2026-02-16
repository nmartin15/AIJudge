import uuid

import pytest
from fastapi.testclient import TestClient

from db.connection import get_db
from main import app


class DummyDB:
    """Minimal DB stub for endpoint tests that short-circuit before DB use."""

    async def execute(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("Database execute should not be called in this test")

    async def get(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("Database get should not be called in this test")

    def add(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("Database add should not be called in this test")

    async def flush(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("Database flush should not be called in this test")

    async def refresh(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("Database refresh should not be called in this test")


@pytest.fixture
def client():
    async def override_get_db():
        yield DummyDB()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def session_header():
    return {"X-Session-Id": str(uuid.uuid4())}
