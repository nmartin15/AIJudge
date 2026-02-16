"""Unified LLM client for OpenAI and Anthropic with cost tracking.

Includes a lightweight circuit breaker so that when a provider is down
the system fails fast instead of burning retries on every request.
"""

import asyncio
import logging
import time
from typing import Any

import anthropic
import openai

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Pricing per 1M tokens (as of 2025)
PRICING = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "text-embedding-3-small": {"input": 0.02, "output": 0.0},
}


def _calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = PRICING.get(model, {"input": 5.0, "output": 15.0})
    return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000


# ── Circuit Breaker ──────────────────────────────────────────────────────────

class CircuitBreaker:
    """Lightweight async circuit breaker (closed → open → half-open).

    - **Closed**: requests flow normally; consecutive failures are counted.
    - **Open**: requests are rejected immediately for ``recovery_seconds``.
    - **Half-open**: one probe request is allowed; success resets, failure
      reopens.
    """

    def __init__(self, name: str, failure_threshold: int = 5, recovery_seconds: float = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self._consecutive_failures = 0
        self._opened_at: float | None = None
        self._half_open = False

    @property
    def is_open(self) -> bool:
        if self._opened_at is None:
            return False
        elapsed = time.monotonic() - self._opened_at
        if elapsed >= self.recovery_seconds:
            return False  # allow a probe (half-open)
        return True

    def record_success(self) -> None:
        if self._consecutive_failures or self._opened_at:
            logger.info("Circuit %s: closed (provider recovered)", self.name)
        self._consecutive_failures = 0
        self._opened_at = None
        self._half_open = False

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._half_open:
            self._opened_at = time.monotonic()
            self._half_open = False
            logger.warning("Circuit %s: re-opened after half-open probe failure", self.name)
        elif self._consecutive_failures >= self.failure_threshold:
            self._opened_at = time.monotonic()
            logger.warning(
                "Circuit %s: opened after %d consecutive failures (recovery in %ds)",
                self.name, self._consecutive_failures, self.recovery_seconds,
            )

    def check(self) -> None:
        """Raise if the circuit is open (provider presumed down)."""
        if self._opened_at is None:
            return
        elapsed = time.monotonic() - self._opened_at
        if elapsed >= self.recovery_seconds:
            self._half_open = True
            logger.info("Circuit %s: entering half-open state (probe allowed)", self.name)
            return
        raise RuntimeError(
            f"Circuit breaker '{self.name}' is open — provider appears down. "
            f"Retry in {int(self.recovery_seconds - elapsed)}s."
        )


_circuits: dict[str, CircuitBreaker] = {}


def _get_circuit(provider: str) -> CircuitBreaker:
    if provider not in _circuits:
        _circuits[provider] = CircuitBreaker(name=provider)
    return _circuits[provider]


# ── Client singletons ────────────────────────────────────────────────────────

_openai_client: openai.AsyncOpenAI | None = None
_anthropic_client: anthropic.AsyncAnthropic | None = None


def get_openai_client() -> openai.AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


def get_anthropic_client() -> anthropic.AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


# ── Retry + circuit-breaker wrapper ──────────────────────────────────────────

def _is_retryable_exception(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if isinstance(status, int):
        if status == 429 or status >= 500:
            return True

    name = exc.__class__.__name__.lower()
    retry_tokens = ("timeout", "rate", "connection", "unavailable", "overloaded")
    return any(token in name for token in retry_tokens)


async def _with_retries(fn, *, provider: str = "unknown"):
    circuit = _get_circuit(provider)
    circuit.check()

    max_retries = max(0, settings.llm_max_retries)
    base_delay = max(50, settings.llm_retry_base_delay_ms) / 1000
    max_delay = max(base_delay, settings.llm_retry_max_delay_ms / 1000)
    timeout = settings.llm_call_timeout_seconds

    for attempt in range(max_retries + 1):
        try:
            result = await asyncio.wait_for(fn(), timeout=timeout)
            circuit.record_success()
            return result
        except asyncio.TimeoutError:
            circuit.record_failure()
            if attempt >= max_retries:
                raise TimeoutError(
                    f"LLM call timed out after {timeout}s (attempt {attempt + 1}/{max_retries + 1})"
                )
            delay = min(max_delay, base_delay * (2**attempt))
            await asyncio.sleep(delay)
        except Exception as exc:
            if not _is_retryable_exception(exc):
                raise
            circuit.record_failure()
            if attempt >= max_retries:
                raise
            delay = min(max_delay, base_delay * (2**attempt))
            await asyncio.sleep(delay)


async def call_openai(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    response_format: Any = None,
) -> dict:
    """Call OpenAI API and return response with metadata."""
    client = get_openai_client()
    model = model or settings.extraction_model
    start = time.monotonic()

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format is not None:
        kwargs["response_format"] = response_format

    response = await _with_retries(
        lambda: client.chat.completions.create(**kwargs),
        provider="openai",
    )
    elapsed_ms = int((time.monotonic() - start) * 1000)

    content = response.choices[0].message.content or ""
    input_tokens = response.usage.prompt_tokens if response.usage else 0
    output_tokens = response.usage.completion_tokens if response.usage else 0

    return {
        "content": content,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": _calculate_cost(model, input_tokens, output_tokens),
        "latency_ms": elapsed_ms,
    }


async def call_anthropic(
    messages: list[dict],
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> dict:
    """Call Anthropic API and return response with metadata."""
    client = get_anthropic_client()
    model = model or settings.reasoning_model
    start = time.monotonic()

    response = await _with_retries(
        lambda: client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            temperature=temperature,
        ),
        provider="anthropic",
    )
    elapsed_ms = int((time.monotonic() - start) * 1000)

    content = response.content[0].text if response.content else ""
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens

    return {
        "content": content,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": _calculate_cost(model, input_tokens, output_tokens),
        "latency_ms": elapsed_ms,
    }


async def generate_embedding(text: str) -> list[float]:
    """Generate an embedding vector for a text string."""
    client = get_openai_client()
    response = await _with_retries(
        lambda: client.embeddings.create(
            model=settings.embedding_model,
            input=text,
            dimensions=settings.embedding_dimensions,
        ),
        provider="openai",
    )
    return response.data[0].embedding
