from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from accounts.models import RegistrationEmailCode

from .mfa import CODE_TTL_SECONDS, MAX_ATTEMPTS, generate_code


def create_registration_code(email, ttl_seconds=CODE_TTL_SECONDS):
    """Create a hashed signup code for an email address and return the raw code.

    Retires any still-unused code for the same address, so a resend
    immediately invalidates the previous code.
    """
    RegistrationEmailCode.objects.filter(email__iexact=email, used=False).update(used=True)

    raw_code = generate_code()
    RegistrationEmailCode.objects.create(
        email=email,
        code_hash=make_password(raw_code),
        expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
    )
    return raw_code


def verify_registration_code(email, raw_code):
    """Consume a matching, unexpired signup code for this email address.

    Mirrors services.mfa.verify_code: a code can be used once, and each code is
    invalidated after MAX_ATTEMPTS wrong guesses.
    """
    if not raw_code:
        return False
    candidates = list(
        RegistrationEmailCode.objects.filter(
            email__iexact=email,
            used=False,
            expires_at__gt=timezone.now(),
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
