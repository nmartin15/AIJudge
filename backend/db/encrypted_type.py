"""SQLAlchemy custom column type for transparent field-level encryption.

Encrypts on write, decrypts on read — application code works with plaintext.
"""

from sqlalchemy import Text, TypeDecorator

from crypto import encrypt_value, decrypt_value


class EncryptedString(TypeDecorator):
    """A String column that encrypts values at rest using Fernet.

    Encrypted ciphertext is longer than plaintext, so the underlying DB
    column is stored as Text to avoid truncation.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Encrypt before writing to the database."""
        if value is None:
            return None
        return encrypt_value(str(value))

    def process_result_value(self, value, dialect):
        """Decrypt when reading from the database."""
        if value is None:
            return None
        return decrypt_value(value)
