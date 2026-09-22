import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from accounts.models import MFACode, MFASettings

MAX_ATTEMPTS = 5
CODE_TTL_SECONDS = 600


def generate_code(length=6):
    return str(secrets.randbelow(10 ** length)).zfill(length)


def get_or_create_mfa_settings(user):
    settings, _ = MFASettings.objects.get_or_create(user=user)
    return settings


def create_mfa_code(user, purpose, method, ttl_seconds=CODE_TTL_SECONDS):
    """Create a hashed one-time code row and return the raw code for delivery."""
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