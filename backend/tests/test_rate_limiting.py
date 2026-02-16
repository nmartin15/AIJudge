"""Tests for the admin login rate limiter and FixedWindowRateLimiter.

Covers:
- Rate limiter allows requests within the limit
- Rate limiter blocks requests beyond the limit
- Rate limiter resets after the window expires
- Admin login endpoint enforces rate limiting
- Per-key isolation (different sessions don't share limits)
"""

import asyncio
import time
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from api.guardrails import FixedWindowRateLimiter


# ─── FixedWindowRateLimiter Unit Tests ────────────────────────────────────────


class TestFixedWindowRateLimiter:
    @pytest.fixture()
    def limiter(self):
        return FixedWindowRateLimiter(max_requests=3, window_seconds=60)

    async def test_allows_up_to_limit(self, limiter):
        for _ in range(3):
            await limiter.check("user1", code="test", message="Too many")

    async def test_blocks_beyond_limit(self, limiter):
        for _ in range(3):
            await limiter.check("user1", code="test", message="Too many")

        with pytest.raises(HTTPException) as exc_info:
            await limiter.check("user1", code="test", message="Too many")
        assert exc_info.value.status_code == 429
        detail = exc_info.value.detail
        assert detail["error"]["code"] == "test"
        assert detail["error"]["retryable"] is True
        assert detail["error"]["details"]["limit"] == 3
        assert detail["error"]["details"]["window_seconds"] == 60

    async def test_different_keys_independent(self, limiter):
        for _ in range(3):
            await limiter.check("user1", code="test", message="Too many")

        # user2 should still be allowed
        await limiter.check("user2", code="test", message="Too many")

    async def test_window_expiry_resets_count(self):
        limiter = FixedWindowRateLimiter(max_requests=2, window_seconds=1)

        await limiter.check("user1", code="test", message="Too many")
        await limiter.check("user1", code="test", message="Too many")

        # Should be blocked now
        with pytest.raises(HTTPException):
            await limiter.check("user1", code="test", message="Too many")

        # Wait for window to expire
        await asyncio.sleep(1.1)

        # Should be allowed again
        await limiter.check("user1", code="test", message="Too many")

    async def test_single_request_allowed(self):
        limiter = FixedWindowRateLimiter(max_requests=1, window_seconds=60)
        await limiter.check("key", code="test", message="Blocked")

        with pytest.raises(HTTPException):
            await limiter.check("key", code="test", message="Blocked")

    async def test_error_message_propagated(self, limiter):
        for _ in range(3):
            await limiter.check("user1", code="rate_limited", message="Custom message")

        with pytest.raises(HTTPException) as exc_info:
            await limiter.check("user1", code="rate_limited", message="Custom message")

        assert exc_info.value.detail["error"]["message"] == "Custom message"
        assert exc_info.value.detail["error"]["code"] == "rate_limited"


# ─── Admin Login Rate Limit Integration ───────────────────────────────────────


class TestAdminLoginRateLimit:
    """Test that the admin-login endpoint rate limiter is configured correctly."""

    async def test_admin_limiter_configured(self):
        """Verify the rate limiter module-level instance has correct params."""
        from api.auth import _admin_login_limiter

        assert _admin_login_limiter.max_requests == 5
        assert _admin_login_limiter.window_seconds == 900  # 15 minutes
