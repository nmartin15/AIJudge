"""Centralized FastAPI exception handlers with a stable error contract."""

from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

DEFAULT_MESSAGES = {
    400: ("bad_request", "Request is invalid."),
    401: ("unauthorized", "Authentication is required."),
    403: ("forbidden", "You do not have permission to perform this action."),
    404: ("not_found", "The requested resource was not found."),
    409: ("conflict", "The request conflicts with existing state."),
    413: ("payload_too_large", "Payload is too large."),
    422: ("validation_error", "Request validation failed."),
    429: ("rate_limited", "Too many requests."),
    500: ("internal_error", "Unexpected server error."),
}


def _payload(
    *,
    code: str,
    message: str,
    retryable: bool,
    details: dict | list | str | None = None,
) -> dict:
    error: dict[str, object] = {
        "code": code,
        "message": message,
        "retryable": retryable,
    }
    if details is not None:
        error["details"] = details
    return {"error": error}


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)

    default_code, default_message = DEFAULT_MESSAGES.get(
        exc.status_code, ("http_error", "Request failed.")
    )
    message = str(detail) if detail else default_message
    retryable = exc.status_code == 429 or exc.status_code >= 500
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(code=default_code, message=message, retryable=retryable),
    )


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_payload(
            code="validation_error",
            message="Request validation failed.",
            retryable=False,
            details=exc.errors(),
        ),
    )


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=_payload(
            code="internal_error",
            message="Unexpected server error.",
            retryable=True,
            details={"exception": exc.__class__.__name__},
        ),
    )
