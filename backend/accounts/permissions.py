from rest_framework.permissions import BasePermission

from .services import get_account_type, get_mfa_status


class MFAEnrolled(BasePermission):
    """Blocks privileged actions until a required MFA method is enrolled.

    A leaked password alone must not be enough to reach privileged admin or
    sponsor endpoints; this is the server-side half of the MFA requirement
    (the frontend also walls off the UI, but that alone is not enforcement).
    """

    message = 'Multi-factor authentication must be set up before continuing.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        status = get_mfa_status(user)
        return (not status['required']) or status['enrolled']


class AdminAccount(BasePermission):
    """Limits an endpoint to admin accounts."""

    message = 'Only admin accounts can do this.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and get_account_type(user) == 'admin')


class SponsorOrAdmin(BasePermission):
    """Limits an endpoint to sponsor and admin accounts."""

    message = 'Only sponsor and admin accounts can do this.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return get_account_type(user) in ('sponsor', 'admin')
