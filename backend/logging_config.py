"""Structured JSON logging configuration.

When DEBUG=true, logs in human-readable format for local development.
When DEBUG=false, logs as single-line JSON for production log aggregators.
"""

import json
import logging
import sys
from datetime import datetime, timezone

from config import get_settings


class JSONFormatter(logging.Formatter):
    """Emit log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception"] = self.formatException(record.exc_info)

        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id

        return json.dumps(payload, default=str)


def setup_logging() -> None:
    """Configure root logger based on the DEBUG setting."""
    settings = get_settings()

    root = logging.getLogger()
    root.setLevel(logging.DEBUG if settings.debug else logging.INFO)

    # Remove any pre-existing handlers (e.g. uvicorn defaults)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if settings.debug:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
                datefmt="%H:%M:%S",
            )
        )
    else:
        handler.setFormatter(JSONFormatter())

    root.addHandler(handler)

    # Quiet down noisy libraries in production
    if not settings.debug:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        logging.getLogger("httpx").setLevel(logging.WARNING)
