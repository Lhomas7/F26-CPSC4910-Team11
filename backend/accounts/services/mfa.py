import secrets
import string
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from accounts.models import MFABackupCode, MFACode, MFASettings

MAX_ATTEMPTS = 5
CODE_TTL_SECONDS = 600

BACKUP_CODE_COUNT = 10
BACKUP_CODE_LENGTH = 10
# Unambiguous alphabet: no 0/O or 1/I/L to keep transcribed codes readable.
BACKUP_CODE_ALPHABET = ''.join(
    c for c in (string.ascii_uppercase + string.digits) if c not in 'O0I1L'
)


def generate_code(length=6):
    return str(secrets.randbelow(10**length)).zfill(length)


def _normalize_backup_code(raw_code):
    return ''.join(ch for ch in (raw_code or '').upper() if ch.isalnum())


def generate_backup_codes(user, count=BACKUP_CODE_COUNT):
    """Replace a user's backup codes with a fresh set, returning the raw codes.

    The raw codes are only ever available at the moment of generation; only
    their hashes are stored.
    """
    MFABackupCode.objects.filter(user=user).delete()
    raw_codes = [
        ''.join(secrets.choice(BACKUP_CODE_ALPHABET) for _ in range(BACKUP_CODE_LENGTH))
        for _ in range(count)
    ]
    MFABackupCode.objects.bulk_create(
        [MFABackupCode(user=user, code_hash=make_password(code)) for code in raw_codes]
    )
    return raw_codes


def verify_backup_code(user, raw_code):
    """Consume a single unused backup code if it matches. One-time use."""
    normalized = _normalize_backup_code(raw_code)
    if not normalized:
        return False
    for row in MFABackupCode.objects.filter(user=user, used_at__isnull=True):
        if check_password(normalized, row.code_hash):
            row.used_at = timezone.now()
            row.save(update_fields=['used_at'])
            return True
    return False


def backup_codes_remaining(user):
    return MFABackupCode.objects.filter(user=user, used_at__isnull=True).count()


def clear_backup_codes(user):
    MFABackupCode.objects.filter(user=user).delete()


def get_or_create_mfa_settings(user):
    settings, _ = MFASettings.objects.get_or_create(user=user)
    return settings


def create_mfa_code(user, purpose, method, ttl_seconds=CODE_TTL_SECONDS):
    """Create a hashed one-time code row and return the raw code for delivery.

    Retires any still-unused code previously issued for this exact
    (user, purpose, method), so requesting a new code — including a resend —
    immediately invalidates the old one instead of leaving both usable.
    """
    MFACode.objects.filter(
        user=user,
        purpose=purpose,
        method=method,
        used=False,
    ).update(used=True)

    raw_code = generate_code()
    expires = timezone.now() + timedelta(seconds=ttl_seconds)
    MFACode.objects.create(
        user=user,
        purpose=purpose,
        method=method,
        code_hash=make_password(raw_code),
        expires_at=expires,
    )
    return raw_code


def verify_code(user, purpose, method, raw_code):
    """Verify a one-time code, hard-scoped to purpose and method.

    A code issued for one purpose ('enroll', 'login', 'reset') can never satisfy
    another. Consumed or invalidated codes cannot be reused. Each code row is
    capped at MAX_ATTEMPTS wrong guesses before it is invalidated.
    """
    now = timezone.now()
    candidates = list(
        MFACode.objects.filter(
            user=user,
            purpose=purpose,
            method=method,
            used=False,
            expires_at__gt=now,
        ).order_by('-created_at')
    )
    for row in candidates:
        if check_password(raw_code, row.code_hash):
            row.used = True
            row.save(update_fields=['used'])
            return True
    for row in candidates:
        row.attempts += 1
        if row.attempts >= MAX_ATTEMPTS:
            row.used = True
        row.save(update_fields=['attempts', 'used'])
    return False
