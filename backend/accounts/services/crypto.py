from cryptography.fernet import Fernet
from django.conf import settings


def encrypt_secret(plaintext):
    """Encrypt a TOTP base32 secret into Fernet ciphertext bytes."""
    return Fernet(settings.TOTP_ENCRYPTION_KEY.encode()).encrypt(plaintext.encode())


def decrypt_secret(ciphertext):
    """Decrypt Fernet ciphertext bytes back into the TOTP base32 secret."""
    return Fernet(settings.TOTP_ENCRYPTION_KEY.encode()).decrypt(ciphertext).decode()
