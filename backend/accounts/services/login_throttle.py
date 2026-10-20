import math
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from accounts.models import LoginAttempt


def lockout_seconds_remaining(username):
    """Seconds until this username may try to sign in again; 0 if it is not locked.

    Built on the LoginAttempt audit rows rather than a cache, so the limit holds
    across server processes and restarts. A username is locked once it has
    LOGIN_MAX_FAILED_ATTEMPTS failures inside the last LOGIN_LOCKOUT_MINUTES
    that came after its most recent success. Keyed by the submitted username,
    not by account, so unknown usernames lock exactly like real ones and the
    response reveals nothing about which accounts exist. Admin, sponsor and
    driver accounts all sign in through the same views, so all share the rule.

    The lock lifts by itself when enough of those failures age out of the window.
    Attempts refused while locked are not recorded as failures, so hammering a
    locked account cannot extend the lock indefinitely.
    """
    name = (username or '').strip()
    if not name:
        return 0

    now = timezone.now()
    window = timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
    since = now - window

    attempts = LoginAttempt.objects.filter(username__iexact=name, timestamp__gt=since)
    last_success = (
        attempts.filter(successful=True)
        .order_by('-timestamp')
        .values_list('timestamp', flat=True)
        .first()
    )
    failures = attempts.filter(successful=False)
    if last_success is not None:
        failures = failures.filter(timestamp__gt=last_success)

    limit = settings.LOGIN_MAX_FAILED_ATTEMPTS
    count = failures.count()
    if count < limit:
        return 0

    # The lock lifts when the failures still in the window drop below the limit,
    # i.e. when the (count - limit + 1)-th oldest one ages out.
    deciding_failure = failures.order_by('timestamp').values_list('timestamp', flat=True)[
        count - limit
    ]
    remaining = (deciding_failure + window - now).total_seconds()
    return max(0, math.ceil(remaining))


def locked_out_response(seconds):
    """429 reply for a locked-out sign-in, with a Retry-After header."""
    minutes = max(1, math.ceil(seconds / 60))
    unit = 'minute' if minutes == 1 else 'minutes'
    response = Response(
        {
            'detail': f'Too many failed sign-in attempts. Try again in {minutes} {unit}.',
            'code': 'login_locked',
            'retry_after': seconds,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    response['Retry-After'] = str(seconds)
    return response
