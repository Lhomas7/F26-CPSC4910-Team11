from datetime import timedelta

from django.contrib.auth import SESSION_KEY, get_user_model, logout
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import AdminImpersonationEvent
from .services import get_account_type, get_mfa_status
from .services.impersonation import view_as_eligibility
from .services.session_state import (
    AUTH_AT_KEY,
    LAST_ACTIVITY_KEY,
    now_ts,
    timeout_policy,
)

IMPERSONATION_TARGET_KEY = 'admin_impersonation_target_id'
IMPERSONATION_STARTED_KEY = 'admin_impersonation_started_at'
IMPERSONATION_ENDED_KEY = 'admin_impersonation_ended'
IMPERSONATION_ROLE_KEY = 'admin_impersonation_target_role'
IMPERSONATION_DURATION = timedelta(minutes=30)
SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again to continue.'
# Refresh the activity stamp at most this often, so ordinary browsing doesn't
# write the session row on every request.
ACTIVITY_WRITE_INTERVAL = 30


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')


def clear_impersonation(session):
    session.pop(IMPERSONATION_TARGET_KEY, None)
    session.pop(IMPERSONATION_STARTED_KEY, None)
    session.pop(IMPERSONATION_ROLE_KEY, None)


def end_impersonation(request, reason, action='invalidate', target=None):
    """Record automatic termination before discarding the effective identity."""
    target_id = request.session.get(IMPERSONATION_TARGET_KEY)
    if not target_id:
        return
    if target is None:
        target = get_user_model().objects.filter(pk=target_id).first()
    admin = getattr(request, 'real_user', request.user)
    if not admin.is_authenticated:
        admin = get_user_model().objects.filter(pk=request.session.get(SESSION_KEY)).first()
    # Preserve the role even after a target is deleted or becomes an admin.
    role = request.session.get(IMPERSONATION_ROLE_KEY)
    if role not in ('driver', 'sponsor'):
        start = AdminImpersonationEvent.objects.filter(
            admin=admin,
            target_id=target_id, action='start',
        ).first()
        role = start.target_role if start else get_account_type(target) if target else ''
    AdminImpersonationEvent.objects.create(
        admin=admin,
        target=target,
        target_role=role,
        action=action,
        reason=reason,
        ip_address=client_ip(request),
    )
    clear_impersonation(request.session)
    request.session[IMPERSONATION_ENDED_KEY] = {
        'active': False,
        'code': reason,
        'detail': 'The View-As session ended. Return to your administrator account.',
    }


def impersonation_details(request, target, admin=None):
    """Return the visible metadata React uses for its persistent warning banner."""
    admin = admin or getattr(request, 'real_user', None)
    started = parse_datetime(request.session.get(IMPERSONATION_STARTED_KEY, ''))
    expires = started + IMPERSONATION_DURATION if started else None
    return {
        'active': True,
        'admin': {
            'id': admin.id,
            'username': admin.get_username(),
            'name': admin.get_full_name() or admin.get_username(),
        },
        'target_role': get_account_type(target),
        'expires_at': expires.isoformat() if expires else None,
    }


class SessionTimeoutMiddleware:
    """Sign out sessions that exceed their idle or absolute limit.

    Runs before AdminImpersonationMiddleware so request.user is still the person
    who signed in: an admin viewing as a driver keeps the admin limits.
    Which limits apply is decided by services.session_state.timeout_policy.
    """

    logout_path = '/api/logout/'

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = request.user
        policy = timeout_policy(user, request.session) if user.is_authenticated else None
        if policy:
            session = request.session
            now = now_ts()
            # Sessions created before these stamps existed start their clock now.
            if AUTH_AT_KEY not in session:
                session[AUTH_AT_KEY] = now
            if LAST_ACTIVITY_KEY not in session:
                session[LAST_ACTIVITY_KEY] = now
            idle_expired = policy['idle'] and now - session[LAST_ACTIVITY_KEY] >= policy['idle']
            absolute_expired = (
                policy['absolute'] and now - session[AUTH_AT_KEY] >= policy['absolute']
            )
            if idle_expired or absolute_expired:
                end_impersonation(request, 'session_expired', action='expire')
                logout(request)
                # Let logout itself finish normally so the client gets its 204.
                if request.path != self.logout_path:
                    return JsonResponse(
                        {'detail': SESSION_EXPIRED_MESSAGE, 'code': 'session_expired'},
                        status=401,
                    )
            elif now - session[LAST_ACTIVITY_KEY] >= ACTIVITY_WRITE_INTERVAL:
                session[LAST_ACTIVITY_KEY] = now

        return self.get_response(request)


class AdminImpersonationMiddleware:
    """Apply a short-lived, server-validated effective identity to admin requests."""

    blocked_mutation_prefixes = (
        '/api/admin/',
        '/api/profile/',
        '/api/change-password/',
        '/api/password-reset/',
        '/api/mfa/',
        # Reading, clearing, and alert settings belong to the account owner.
        '/api/notifications/',
    )
    stop_path = '/api/admin/impersonation/stop/'

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.real_user = request.user
        target_id = request.session.get(IMPERSONATION_TARGET_KEY)
        if target_id and not request.real_user.is_authenticated:
            end_impersonation(request, 'view_as_admin_session_ended')
            logout(request)
            return JsonResponse(
                {'code': 'session_expired', 'detail': SESSION_EXPIRED_MESSAGE}, status=401,
            )
        if target_id and request.real_user.is_authenticated:
            admin_mfa = get_mfa_status(request.real_user)
            if not request.real_user.is_staff or not request.real_user.is_active:
                end_impersonation(request, 'view_as_admin_ineligible')
                logout(request)
                return JsonResponse(
                    {'code': 'session_expired', 'detail': SESSION_EXPIRED_MESSAGE}, status=401,
                )
            if admin_mfa['required'] and not admin_mfa['enrolled']:
                end_impersonation(request, 'view_as_admin_mfa_required')
                target_id = None
        if target_id and request.real_user.is_authenticated and request.real_user.is_staff:
            try:
                started = parse_datetime(request.session.get(IMPERSONATION_STARTED_KEY, ''))
            except (TypeError, ValueError):
                started = None
            if started and timezone.is_naive(started):
                started = None
            expired = not started or timezone.now() >= started + IMPERSONATION_DURATION
            target = get_user_model().objects.filter(pk=target_id).first()
            ineligible = view_as_eligibility(target) if target else {
                'code': 'view_as_target_deleted',
            }

            if expired or ineligible:
                end_impersonation(
                    request,
                    'view_as_expired' if expired else ineligible['code'],
                    action='expire' if expired else 'invalidate',
                    target=target,
                )
            else:
                request.user = target
                request.impersonation_active = True
                if (
                    request.method not in ('GET', 'HEAD', 'OPTIONS')
                    and request.path != self.stop_path
                    and request.path.startswith(self.blocked_mutation_prefixes)
                ):
                    return JsonResponse(
                        {
                            'detail': 'Stop viewing as this user before changing account, security, or admin settings.'
                        },
                        status=403,
                    )

        # Do not execute a stale target request with the administrator's identity.
        # Keep this guard until the client acknowledges the administrator return;
        # concurrent requests must not silently regain administrator privileges.
        ended = request.session.get(IMPERSONATION_ENDED_KEY)
        if ended and request.path.startswith('/api/') and request.path not in (
            '/api/me/', self.stop_path, '/api/logout/', '/api/csrf/',
        ):
            return JsonResponse(ended, status=409)
        return self.get_response(request)
