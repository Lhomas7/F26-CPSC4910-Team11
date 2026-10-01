import logging
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMessage
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from . import get_account_type

logger = logging.getLogger(__name__)


def find_resettable_users(email):
    """Active, non-admin application accounts that use this email address.

    Accounts with an unusable password (never set, or disabled) cannot be reset
    by email. Admin accounts (is_staff/is_superuser) are deliberately excluded:
    a compromised inbox must not be able to reach a privileged account this way,
    the same reasoning that already restricts admin MFA to the authenticator app
    only (see ROLE_MFA_CONFIG). An admin's password is reset by another admin
    through the Django admin, or via `manage.py changepassword` on the server."""
    users = get_user_model().objects.filter(email__iexact=email, is_active=True)
    return [
        user for user in users
        if user.has_usable_password() and (get_account_type(user) is not None) and not (user.is_staff or user.is_superuser)
    ]


def build_reset_url(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    base = settings.FRONTEND_URL.rstrip('/')
    return f'{base}/reset-password/{quote(uid, safe="")}/{quote(token, safe="")}'


def reset_link_lifetime_minutes():
    return max(1, settings.PASSWORD_RESET_TIMEOUT // 60)


def send_password_reset_email(user):
    """Email a single-use reset link that expires after PASSWORD_RESET_TIMEOUT."""
    minutes = reset_link_lifetime_minutes()
    body = (
        f'Hello {user.get_username()},\n\n'
        'We received a request to reset the password for your Good Driver account.\n'
        f'Use the link below to choose a new password. It expires in {minutes} minutes '
        'and stops working once it has been used.\n\n'
        f'{build_reset_url(user)}\n\n'
        'If you did not request this, you can ignore this email; your password '
        'will not change.'
    )
    EmailMessage(
        subject='Reset your Good Driver password',
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    ).send(fail_silently=False)


def user_from_uid(uidb64):
    """Resolve the base64 user id from a reset link, or None if it is not valid."""
    User = get_user_model()
    try:
        pk = force_str(urlsafe_base64_decode(uidb64))
        return User.objects.get(pk=pk, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None


def token_is_valid(user, token):
    return default_token_generator.check_token(user, token)
