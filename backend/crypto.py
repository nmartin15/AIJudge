"""Field-level encryption for PII and file-at-rest protection.

Uses Fernet (AES-128-CBC with HMAC-SHA256) for symmetric encryption of
sensitive fields like names, addresses, phone numbers, and uploaded files.

The encryption key is loaded from the FIELD_ENCRYPTION_KEY environment
variable.  Generate a key with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import logging

from cryptography.fernet import Fernet, InvalidToken

from config import get_settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet | None:
    """Lazily initialize the Fernet cipher from the configured key."""
    global _fernet
    if _fernet is not None:
        return _fernet

    settings = get_settings()
    key = settings.field_encryption_key
    if not key:
        logger.warning(
            "FIELD_ENCRYPTION_KEY is not set — PII fields and files will NOT be encrypted. "
            "Generate a key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
        return None

    try:
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        return _fernet
    except Exception as exc:
        logger.error("Invalid FIELD_ENCRYPTION_KEY: %s", exc)
        return None


def is_encryption_enabled() -> bool:
    """Return True if field-level encryption is configured."""
    return _get_fernet() is not None


# ─── String field encryption ──────────────────────────────────────────────────


def encrypt_value(plaintext: str | None) -> str | None:
    """Encrypt a string value.  Returns None if input is None."""
    if plaintext is None:
        return None
    fernet = _get_fernet()
    if fernet is None:
        return plaintext  # Graceful degradation: no key = no encryption
    return fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_value(ciphertext: str | None) -> str | None:
    """Decrypt a string value.  Returns None if input is None.

    If decryption fails (e.g. the value was stored before encryption was
    enabled), returns the original value unchanged so existing data remains
    readable during migration.
    """
    if ciphertext is None:
        return None
    fernet = _get_fernet()
    if fernet is None:
        return ciphertext
    try:
        return fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        # Value was likely stored before encryption was enabled — return as-is
        return ciphertext


# ─── Binary file encryption ──────────────────────────────────────────────────


def encrypt_file_bytes(data: bytes) -> bytes:
    """Encrypt raw file bytes.  Returns data unchanged if no key is configured."""
    fernet = _get_fernet()
    if fernet is None:
        return data
    return fernet.encrypt(data)


def decrypt_file_bytes(data: bytes) -> bytes:
    """Decrypt file bytes.  Falls back to returning raw data if decryption fails."""
    fernet = _get_fernet()
    if fernet is None:
        return data
    try:
        return fernet.decrypt(data)
    except (InvalidToken, Exception):
        # File was likely stored before encryption was enabled
        return data
