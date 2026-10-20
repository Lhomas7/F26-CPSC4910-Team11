from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models

# Marks a stored value as ciphertext. Values without it are legacy plaintext that
# has not been through the data migration yet, and are passed through unchanged.
CIPHERTEXT_PREFIX = 'enc1:'


def _fernet():
    return Fernet(settings.FIELD_ENCRYPTION_KEY.encode())


class EncryptedCharField(models.TextField):
    """Text encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before it is stored.

    The application sees plain strings; the database only ever holds
    ``enc1:<ciphertext>``. Encryption uses a fresh random IV each time, so the
    same value encrypts differently on every save. That is the point, but it means
    the column cannot be searched, filtered or ordered in SQL. Keep fields that
    must be looked up (username, email) out of it.

    Empty strings and NULL are stored as-is so "no value" stays distinguishable
    without decrypting. Length limits belong in the serializers, because the
    ciphertext is longer than the text it protects.
    """

    description = 'Encrypted text'

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == '':
            return value
        token = _fernet().encrypt(str(value).encode()).decode()
        return f'{CIPHERTEXT_PREFIX}{token}'

    def from_db_value(self, value, expression, connection):
        if value is None or value == '' or not value.startswith(CIPHERTEXT_PREFIX):
            return value
        try:
            return _fernet().decrypt(value[len(CIPHERTEXT_PREFIX) :].encode()).decode()
        except InvalidToken:
            # Never hand ciphertext to callers (it could end up in an SMS or a
            # response). A wrong key is a deployment error, so fail loudly.
            raise ImproperlyConfigured(
                'An encrypted column could not be decrypted. Check that '
                'FIELD_ENCRYPTION_KEY (or TOTP_ENCRYPTION_KEY) matches the key '
                'the data was encrypted with.'
            ) from None
