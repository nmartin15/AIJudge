"""File upload/download service with encryption at rest.

Centralizes file I/O, validation, path management, and encryption so the
API layer only deals with request/response concerns.
"""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from config import get_settings
from crypto import decrypt_file_bytes, encrypt_file_bytes

settings = get_settings()

MAX_UPLOAD_SIZE_BYTES = settings.max_upload_size_mb * 1024 * 1024
ALLOWED_EXTENSIONS = frozenset({
    ".pdf", ".png", ".jpg", ".jpeg", ".webp",
    ".txt", ".csv", ".doc", ".docx", ".eml", ".msg",
})


def _sanitize_filename(raw_name: str) -> str:
    """Strip dangerous characters and validate the result."""
    sanitized = re.sub(r"[^A-Za-z0-9._-]", "_", raw_name).strip("._")
    if not sanitized:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return sanitized


def _validate_extension(filename: str) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")


async def save_upload(file: UploadFile, case_id: uuid.UUID) -> str:
    """Read, validate, encrypt, and persist an uploaded file.

    Returns the on-disk file path (relative to upload_dir).
    Raises HTTPException on validation failure.
    """
    original_name = Path(file.filename or "").name
    sanitized = _sanitize_filename(original_name)
    _validate_extension(sanitized)

    upload_dir = os.path.join(settings.upload_dir, str(case_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{uuid.uuid4()}_{sanitized}")

    total_size = 0
    raw_chunks: list[bytes] = []
    try:
        while chunk := await file.read(64 * 1024):
            total_size += len(chunk)
            if total_size > MAX_UPLOAD_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Max size is {settings.max_upload_size_mb}MB",
                )
            raw_chunks.append(chunk)

        plaintext = b"".join(raw_chunks)
        ciphertext = encrypt_file_bytes(plaintext)
        with open(file_path, "wb") as f:
            f.write(ciphertext)
    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    return file_path


def read_and_decrypt(file_path: str) -> bytes:
    """Read an encrypted file from disk and return the plaintext bytes.

    Validates the path stays within the allowed upload directory.
    """
    abs_path = os.path.abspath(file_path)
    allowed_root = os.path.abspath(settings.upload_dir)
    if not abs_path.startswith(allowed_root):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    with open(abs_path, "rb") as f:
        ciphertext = f.read()
    return decrypt_file_bytes(ciphertext)


def safe_filename(file_path: str) -> str:
    """Extract just the basename for Content-Disposition headers."""
    return os.path.basename(file_path)
