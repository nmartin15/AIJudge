"""Shared guardrail helpers: API error envelope and lightweight rate limiting."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import HTTPException


def api_error(
    *,
    status_code: int,
    code: str,
    message: str,
    retryable: bool = False,
    details: dict | None = None,
) -> HTTPException:
    payload: dict[str, object] = {
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
        }
    }
    if details:
        payload["error"]["details"] = details
    return HTTPException(status_code=status_code, detail=payload)


class FixedWindowRateLimiter:
    """In-memory, per-key fixed-window rate limiter with per-key locking."""

    _MAX_LOCKS = 10_000

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._locks: dict[str, asyncio.Lock] = {}
        self._meta_lock = asyncio.Lock()

    async def _get_lock(self, key: str) -> asyncio.Lock:
        """Get or create a per-key lock, evicting stale locks if over limit."""
        if key in self._locks:
            return self._locks[key]
        async with self._meta_lock:
            if key not in self._locks:
                if len(self._locks) > self._MAX_LOCKS:
                    stale = [k for k in self._locks if k not in self._events]
                    for k in stale:
                        self._locks.pop(k, None)
                self._locks[key] = asyncio.Lock()
            return self._locks[key]

    async def check(self, key: str, *, code: str, message: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        lock = await self._get_lock(key)
        async with lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if not events:
                self._events.pop(key, None)
                self._locks.pop(key, None)
            if len(events) >= self.max_requests:
                raise api_error(
                    status_code=429,
                    code=code,
                    message=message,
                    retryable=True,
                    details={
                        "limit": self.max_requests,
                        "window_seconds": self.window_seconds,
                    },
                )
            self._events[key].append(now)


def rate_limit_dependency(
    limiter: FixedWindowRateLimiter,
    *,
    key_fn: Callable[[str | None], str] | None = None,
    code: str,
    message: str,
):
    """Create a FastAPI dependency enforcing a limiter against an optional key."""

    async def _check(session_id: str | None = None) -> None:
        key = key_fn(session_id) if key_fn else "global"
        await limiter.check(key, code=code, message=message)

    return _check
