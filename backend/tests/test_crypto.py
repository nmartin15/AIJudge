"""Tests for field-level encryption (crypto.py) and EncryptedString column type.

Covers:
- Encrypt/decrypt round-trip for strings and bytes
- None passthrough
- Graceful degradation when no key is configured
- Migration scenario: decrypting plaintext that was stored before encryption
- EncryptedString SQLAlchemy type decorator
"""

import importlib

import pytest
from cryptography.fernet import Fernet
from unittest.mock import patch, MagicMock


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_fernet_cache():
    """Reset the module-level _fernet singleton between tests."""
    import crypto
    crypto._fernet = None
    yield
    crypto._fernet = None


@pytest.fixture()
def valid_key():
    """Generate a fresh Fernet key for testing."""
    return Fernet.generate_key().decode()


@pytest.fixture()
def settings_with_key(valid_key):
    """Patch get_settings to return a settings object with a valid encryption key."""
    mock_settings = MagicMock()
    mock_settings.field_encryption_key = valid_key
    with patch("crypto.get_settings", return_value=mock_settings):
        yield mock_settings


@pytest.fixture()
def settings_without_key():
    """Patch get_settings to return a settings object with no encryption key."""
    mock_settings = MagicMock()
    mock_settings.field_encryption_key = ""
    with patch("crypto.get_settings", return_value=mock_settings):
        yield mock_settings


@pytest.fixture()
def settings_with_bad_key():
    """Patch get_settings to return a settings object with an invalid key."""
    mock_settings = MagicMock()
    mock_settings.field_encryption_key = "not-a-valid-fernet-key"
    with patch("crypto.get_settings", return_value=mock_settings):
        yield mock_settings


# ─── String Encryption Round-Trip ─────────────────────────────────────────────


class TestStringEncryption:
    def test_encrypt_decrypt_round_trip(self, settings_with_key):
        from crypto import encrypt_value, decrypt_value

        original = "Jane Doe"
        encrypted = encrypt_value(original)
        assert encrypted is not None
        assert encrypted != original, "Encrypted value should differ from plaintext"
        decrypted = decrypt_value(encrypted)
        assert decrypted == original

    def test_round_trip_unicode(self, settings_with_key):
        from crypto import encrypt_value, decrypt_value

        original = "Maria Garcia-Lopez 123 Main St"
        encrypted = encrypt_value(original)
        assert decrypt_value(encrypted) == original

    def test_round_trip_empty_string(self, settings_with_key):
        from crypto import encrypt_value, decrypt_value

        encrypted = encrypt_value("")
        assert encrypted is not None
        assert decrypt_value(encrypted) == ""

    def test_encrypt_none_returns_none(self, settings_with_key):
        from crypto import encrypt_value

        assert encrypt_value(None) is None

    def test_decrypt_none_returns_none(self, settings_with_key):
        from crypto import decrypt_value

        assert decrypt_value(None) is None

    def test_different_encryptions_differ(self, settings_with_key):
        """Fernet includes a timestamp so two encryptions of the same value differ."""
        from crypto import encrypt_value

        a = encrypt_value("same-value")
        b = encrypt_value("same-value")
        assert a != b, "Two encryptions of the same plaintext should differ (Fernet nonce)"


# ─── File Encryption Round-Trip ───────────────────────────────────────────────


class TestFileEncryption:
    def test_encrypt_decrypt_bytes(self, settings_with_key):
        from crypto import encrypt_file_bytes, decrypt_file_bytes

        original = b"PDF binary content here \x00\xff\xfe"
        encrypted = encrypt_file_bytes(original)
        assert encrypted != original
        assert decrypt_file_bytes(encrypted) == original

    def test_empty_bytes(self, settings_with_key):
        from crypto import encrypt_file_bytes, decrypt_file_bytes

        encrypted = encrypt_file_bytes(b"")
        assert decrypt_file_bytes(encrypted) == b""

    def test_large_payload(self, settings_with_key):
        from crypto import encrypt_file_bytes, decrypt_file_bytes

        original = b"x" * (5 * 1024 * 1024)  # 5 MB
        encrypted = encrypt_file_bytes(original)
        assert decrypt_file_bytes(encrypted) == original


# ─── Graceful Degradation (No Key) ───────────────────────────────────────────


class TestNoEncryptionKey:
    def test_encrypt_value_passthrough(self, settings_without_key):
        from crypto import encrypt_value

        assert encrypt_value("plaintext") == "plaintext"

    def test_decrypt_value_passthrough(self, settings_without_key):
        from crypto import decrypt_value

        assert decrypt_value("plaintext") == "plaintext"

    def test_encrypt_file_bytes_passthrough(self, settings_without_key):
        from crypto import encrypt_file_bytes

        data = b"raw data"
        assert encrypt_file_bytes(data) is data

    def test_decrypt_file_bytes_passthrough(self, settings_without_key):
        from crypto import decrypt_file_bytes

        data = b"raw data"
        assert decrypt_file_bytes(data) is data

    def test_is_encryption_enabled_false(self, settings_without_key):
        from crypto import is_encryption_enabled

        assert is_encryption_enabled() is False

    def test_none_still_returns_none(self, settings_without_key):
        from crypto import encrypt_value, decrypt_value

        assert encrypt_value(None) is None
        assert decrypt_value(None) is None


# ─── Encryption Enabled Flag ─────────────────────────────────────────────────


class TestEncryptionEnabled:
    def test_enabled_with_valid_key(self, settings_with_key):
        from crypto import is_encryption_enabled

        assert is_encryption_enabled() is True

    def test_disabled_with_bad_key(self, settings_with_bad_key):
        from crypto import is_encryption_enabled

        assert is_encryption_enabled() is False


# ─── Migration Scenario ──────────────────────────────────────────────────────


class TestMigrationScenario:
    """When encryption is enabled but existing data was stored as plaintext."""

    def test_decrypt_plaintext_returns_unchanged(self, settings_with_key):
        from crypto import decrypt_value

        plaintext = "stored before encryption was enabled"
        result = decrypt_value(plaintext)
        assert result == plaintext, "Should return plaintext unchanged on InvalidToken"

    def test_decrypt_file_bytes_plaintext_returns_unchanged(self, settings_with_key):
        from crypto import decrypt_file_bytes

        raw = b"old file stored unencrypted"
        result = decrypt_file_bytes(raw)
        assert result == raw, "Should return raw bytes unchanged on InvalidToken"

    def test_decrypt_corrupted_ciphertext_returns_unchanged(self, settings_with_key):
        from crypto import decrypt_value

        corrupted = "gAAAAABf_corrupted_data_here"
        result = decrypt_value(corrupted)
        assert result == corrupted


# ─── EncryptedString Column Type ──────────────────────────────────────────────


class TestEncryptedStringType:
    def test_process_bind_param_encrypts(self, settings_with_key):
        from db.encrypted_type import EncryptedString

        col = EncryptedString()
        result = col.process_bind_param("John Doe", dialect=None)
        assert result is not None
        assert result != "John Doe"

    def test_process_result_value_decrypts(self, settings_with_key):
        from crypto import encrypt_value
        from db.encrypted_type import EncryptedString

        col = EncryptedString()
        encrypted = encrypt_value("John Doe")
        result = col.process_result_value(encrypted, dialect=None)
        assert result == "John Doe"

    def test_process_bind_param_none(self, settings_with_key):
        from db.encrypted_type import EncryptedString

        col = EncryptedString()
        assert col.process_bind_param(None, dialect=None) is None

    def test_process_result_value_none(self, settings_with_key):
        from db.encrypted_type import EncryptedString

        col = EncryptedString()
        assert col.process_result_value(None, dialect=None) is None

    def test_round_trip_through_type(self, settings_with_key):
        from db.encrypted_type import EncryptedString

        col = EncryptedString()
        bound = col.process_bind_param("sensitive data", dialect=None)
        result = col.process_result_value(bound, dialect=None)
        assert result == "sensitive data"

    def test_passthrough_without_key(self, settings_without_key):
        from db.encrypted_type import EncryptedString

        col = EncryptedString()
        bound = col.process_bind_param("plaintext", dialect=None)
        assert bound == "plaintext"
        result = col.process_result_value(bound, dialect=None)
        assert result == "plaintext"
