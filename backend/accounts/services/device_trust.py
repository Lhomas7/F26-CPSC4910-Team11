"""Remembered devices and the signals behind the "Is this your device?" check.

Privacy: a trusted browser is identified only by a random token in an HttpOnly
cookie, and only the token's SHA-256 is stored. No IP address, user agent, or
location is collected. The other signal, recent failed sign-ins, comes from the
existing LoginAttempt audit rows.
"""

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db.models import Max
from django.utils import timezone

from accounts.models import LoginAttempt, TrustedDevice

# Session keys written at sign-in.
DEVICE_CHECK_KEY = 'device_check'  # pending question: 'new_device' or 'recent_failures'
DEVICE_MODE_KEY = 'device_mode'  # answered or implied: 'trusted' or 'shared'

NEW_DEVICE = 'new_device'
RECENT_FAILURES = 'recent_failures'

# token_urlsafe(32) yields 43 characters; reject anything implausible before hashing.
_MAX_TOKEN_LENGTH = 64


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _trust_lifetime():
    return timedelta(days=settings.TRUSTED_DEVICE_DAYS)


def _cookie_token(request):
    token = request.COOKIES.get(settings.TRUSTED_DEVICE_COOKIE_NAME, '')
    return token if 0 < len(token) <= _MAX_TOKEN_LENGTH else None


def is_trusted(request, user):
    """Whether this browser carries a current trust token for this user."""
    token = _cookie_token(request)
    if token is None:
        return False
    updated = TrustedDevice.objects.filter(
        user=user,
        token_hash=_hash(token),
        created_at__gte=timezone.now() - _trust_lifetime(),
    ).update(last_used_at=timezone.now())
    return updated > 0


def recent_failures(user):
    """Failed sign-ins for this user in the window, since their last success."""
    since = timezone.now() - timedelta(minutes=settings.SUSPICIOUS_FAILURE_WINDOW_MINUTES)
    last_success = (
        LoginAttempt.objects.filter(user=user, successful=True)
        .aggregate(latest=Max('timestamp'))['latest']
    )
    if last_success and last_success > since:
        since = last_success
    return LoginAttempt.objects.filter(
        user=user, successful=False, timestamp__gt=since
    ).count()


def device_check_reason(request, user):
    """Why this sign-in needs the device question, or None if it doesn't.

    Recent failures win over a trusted device: someone may be guessing the
    password from a browser the owner trusted.
    """
    if recent_failures(user) >= settings.SUSPICIOUS_FAILURE_THRESHOLD:
        return RECENT_FAILURES
    if not is_trusted(request, user):
        return NEW_DEVICE
    return None


def trust_device(response, request, user):
    """Remember this browser for this user and (re)issue the cookie."""
    token = _cookie_token(request) or secrets.token_urlsafe(32)
    token_hash = _hash(token)
    now = timezone.now()
    # Drop expired rows and any earlier row for this browser, so trust always
    # runs for the full lifetime from the latest "Yes".
    TrustedDevice.objects.filter(user=user, created_at__lt=now - _trust_lifetime()).delete()
    TrustedDevice.objects.filter(user=user, token_hash=token_hash).delete()
    TrustedDevice.objects.create(user=user, token_hash=token_hash)
    response.set_cookie(
        settings.TRUSTED_DEVICE_COOKIE_NAME,
        token,
        max_age=int(_trust_lifetime().total_seconds()),
        domain=settings.SESSION_COOKIE_DOMAIN,
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )


def revoke_devices(user):
    """Forget every browser this user trusted."""
    TrustedDevice.objects.filter(user=user).delete()
