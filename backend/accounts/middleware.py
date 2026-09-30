from datetime import timedelta

from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import AdminImpersonationEvent
from .services import get_account_type


IMPERSONATION_TARGET_KEY = 'admin_impersonation_target_id'
IMPERSONATION_STARTED_KEY = 'admin_impersonation_started_at'
IMPERSONATION_DURATION = timedelta(minutes=30)


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')


def clear_impersonation(session):
    session.pop(IMPERSONATION_TARGET_KEY, None)
    session.pop(IMPERSONATION_STARTED_KEY, None)


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


class AdminImpersonationMiddleware:
    """Apply a short-lived, server-validated effective identity to admin requests."""

    blocked_mutation_prefixes = (
        '/api/admin/',
        '/api/profile/',
        '/api/change-password/',
        '/api/password-reset/',
        '/api/mfa/',
    )
    stop_path = '/api/admin/impersonation/stop/'

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.real_user = request.user
        target_id = request.session.get(IMPERSONATION_TARGET_KEY)
        if target_id and request.real_user.is_authenticated and request.real_user.is_staff:
            started = parse_datetime(request.session.get(IMPERSONATION_STARTED_KEY, ''))
            expired = not started or timezone.now() >= started + IMPERSONATION_DURATION
            target = get_user_model().objects.filter(pk=target_id).first()
            role = get_account_type(target) if target else None

            if expired or not target or not target.is_active or role not in ('driver', 'sponsor'):
                if expired and target:
                    AdminImpersonationEvent.objects.create(
                        admin=request.real_user,
                        target=target,
                        target_role=role or 'driver',
                        action='expire',
                        ip_address=client_ip(request),
                    )
                clear_impersonation(request.session)
            else:
                request.user = target
                request.impersonation_active = True
                if (
                    request.method not in ('GET', 'HEAD', 'OPTIONS')
                    and request.path != self.stop_path
                    and request.path.startswith(self.blocked_mutation_prefixes)
                ):
                    return JsonResponse(
                        {'detail': 'Stop viewing as this user before changing account, security, or admin settings.'},
                        status=403,
                    )

        return self.get_response(request)
