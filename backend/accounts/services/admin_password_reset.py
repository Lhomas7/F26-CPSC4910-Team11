"""Password reset for administrator accounts.

Administrators are deliberately left out of the public "Forgot password" email
flow (see find_resettable_users): a compromised inbox must not be enough to reach
a privileged account. This is the replacement, and every step is stricter:

1. Another administrator, signed in with MFA and re-entering their own password,
   starts the reset for a named administrator. Nobody can start one for
   themselves, and the person starting it never sees the link or sets the
   password.
2. The link goes to the target's email address and expires after
   ADMIN_PASSWORD_RESET_TIMEOUT (15 minutes by default). It is signed with its
   own key salt, so it cannot be used at the ordinary reset endpoint, and it dies
   once the password changes or the target signs in.
3. The link alone does nothing. Finishing the reset also needs a current code from
   the target's authenticator app, or one of their backup codes.
4. Finishing it ends every session and trusted device, emails the target, and
   writes an audit row. So does starting it.

An administrator who has lost both the authenticator and the backup codes is
reset on the server with `manage.py changepassword <username>`.
"""

import logging
from datetime import datetime, timedelta
from urllib.parse import quote

import pyotp
from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import EmailMessage
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import base36_to_int, urlsafe_base64_encode

from accounts.models import AdminPasswordResetEvent, MFABackupCode

from .crypto import decrypt_secret
from .mfa import _normalize_backup_code

logger = logging.getLogger(__name__)

# Django's token timestamps count seconds from this date.
_TOKEN_EPOCH = datetime(2001, 1, 1)


class AdminPasswordResetTokenGenerator(PasswordResetTokenGenerator):
    """Reset tokens that are separate from, and shorter-lived than, ordinary ones."""

    key_salt = 'accounts.services.admin_password_reset.AdminPasswordResetTokenGenerator'

    def check_token(self, user, token):
        # Signature, single-use (password hash) and the general PASSWORD_RESET_TIMEOUT.
        if not user or not token or not super().check_token(user, token):
            return False
        try:
            issued = base36_to_int(token.split('-')[0])
        except ValueError:
            return False
        age = int((datetime.now() - _TOKEN_EPOCH).total_seconds()) - issued
        return age <= settings.ADMIN_PASSWORD_RESET_TIMEOUT


admin_token_generator = AdminPasswordResetTokenGenerator()


def can_receive_admin_reset(user):
    """An active administrator with a password and an authenticator app.

    Without an authenticator there is nothing to confirm the link with, so a link
    would be useless (or, worse, tempting to relax); those accounts are reset on
    the server instead.
    """
    mfa = getattr(user, 'mfa_settings', None)
    return bool(
        user.is_active
        and (user.is_staff or user.is_superuser)
        and user.has_usable_password()
        and mfa is not None
        and mfa.totp_enabled
        and mfa.totp_secret_encrypted
    )


def build_admin_reset_url(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = admin_token_generator.make_token(user)
    base = settings.FRONTEND_URL.rstrip('/')
    return f'{base}/admin-reset-password/{quote(uid, safe="")}/{quote(token, safe="")}'


def admin_reset_link_lifetime_minutes():
    return max(1, settings.ADMIN_PASSWORD_RESET_TIMEOUT // 60)


def send_admin_password_reset_email(target, requested_by):
    """Email the target a link. It names who asked, so a surprise is easy to spot."""
    minutes = admin_reset_link_lifetime_minutes()
    body = (
        f'Hello {target.get_username()},\n\n'
        f'The administrator "{requested_by.get_username()}" started a password reset '
        'for your Good Driver administrator account.\n\n'
        f'Use the link below within {minutes} minutes. You will need a code from your '
        'authenticator app (or one of your backup codes) to finish. The link stops '
        'working once it has been used.\n\n'
        f'{build_admin_reset_url(target)}\n\n'
        'If you were not expecting this, do not use the link and tell another '
        'administrator right away.'
    )
    EmailMessage(
        subject='Reset your Good Driver administrator password',
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[target.email],
    ).send(fail_silently=False)


def reset_requested_recently(target):
    """Whether a link was already sent to this administrator inside the cooldown."""
    since = timezone.now() - timedelta(seconds=settings.ADMIN_PASSWORD_RESET_COOLDOWN)
    return AdminPasswordResetEvent.objects.filter(
        target=target, action='requested', created_at__gte=since
    ).exists()


def record_admin_reset_event(target, action, requested_by=None, ip_address=None):
    AdminPasswordResetEvent.objects.create(
        target=target,
        requested_by=requested_by,
        action=action,
        ip_address=ip_address,
    )


def match_second_factor(user, method, code):
    """Check an authenticator or backup code without spending it.

    Returns a function that spends the code (a no-op for authenticator codes) or
    None when the code is wrong. Spending is separate so that a backup code is
    only used up once the password change has actually gone through.
    """
    code = (code or '').strip()
    if method == 'totp':
        mfa = getattr(user, 'mfa_settings', None)
        if mfa is None or not mfa.totp_enabled or not mfa.totp_secret_encrypted:
            return None
        secret = decrypt_secret(bytes(mfa.totp_secret_encrypted))
        return (lambda: None) if pyotp.TOTP(secret).verify(code) else None

    if method == 'backup':
        normalized = _normalize_backup_code(code)
        if not normalized:
            return None
        for row in MFABackupCode.objects.filter(user=user, used_at__isnull=True):
            if check_password(normalized, row.code_hash):

                def spend(row=row):
                    row.used_at = timezone.now()
                    row.save(update_fields=['used_at'])

                return spend
    return None
