from django.conf import settings
from django.utils import timezone

from . import get_account_type
from .device_trust import DEVICE_CHECK_KEY, DEVICE_MODE_KEY

# Epoch seconds, stamped at sign-in and refreshed by SessionTimeoutMiddleware.
AUTH_AT_KEY = 'auth_at'
LAST_ACTIVITY_KEY = 'last_activity'


def now_ts():
    return timezone.now().timestamp()


def timeout_policy(user, session):
    """The idle/absolute limits that apply to this session, or None.

    When several apply (an admin on a shared device), the stricter of each wins.
    """
    applicable = []
    if get_account_type(user) == 'admin':
        applicable.append(settings.SESSION_TIMEOUTS['admin'])
    if session.get(DEVICE_MODE_KEY) == 'shared':
        applicable.append(settings.SESSION_TIMEOUTS['shared_device'])
    if not applicable:
        return None

    def strictest(key):
        limits = [policy[key] for policy in applicable if policy.get(key)]
        return min(limits) if limits else None

    return {'idle': strictest('idle'), 'absolute': strictest('absolute')}


def stamp_sign_in(session):
    timestamp = now_ts()
    session[AUTH_AT_KEY] = timestamp
    session[LAST_ACTIVITY_KEY] = timestamp


def session_info(request):
    """Session details the frontend needs alongside the signed-in user."""
    # Limits follow whoever signed in, even while an admin views as someone else.
    # (real_user is captured before login() runs, so only trust it while
    # impersonation is actually active.)
    user = request.real_user if getattr(request, 'impersonation_active', False) else request.user
    policy = timeout_policy(user, request.session)
    return {
        'device_check': request.session.get(DEVICE_CHECK_KEY),
        'idle_timeout_seconds': policy['idle'] if policy else None,
    }
