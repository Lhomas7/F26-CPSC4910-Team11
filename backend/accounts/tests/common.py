from contextlib import contextmanager
from unittest.mock import patch

import pyotp
from django.core import mail
from django.test import override_settings

from ..models import MFASettings
from ..services.crypto import encrypt_secret


def enroll_totp(user):
    """Give a user an enabled TOTP method, satisfying the MFAEnrolled permission."""
    mfa, _ = MFASettings.objects.get_or_create(user=user)
    mfa.totp_enabled = True
    mfa.totp_secret_encrypted = encrypt_secret(pyotp.random_base32())
    mfa.save(update_fields=['totp_enabled', 'totp_secret_encrypted'])
    return mfa


class InlineThread:
    """Stand-in for threading.Thread that runs its target as soon as it starts."""

    def __init__(self, target, args=(), kwargs=None, **_options):
        self.target = target
        self.args = args
        self.kwargs = kwargs or {}

    def start(self):
        self.target(*self.args, **self.kwargs)


def send_reset_emails_inline(test_case):
    """Make background password reset emails land in mail.outbox before returning."""
    patcher = patch('accounts.services.password_reset.Thread', InlineThread)
    patcher.start()
    test_case.addCleanup(patcher.stop)


class MailAssertMixin:
    @contextmanager
    def assertSendsMail(self, count):
        with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            mail.outbox = []
            yield
            self.assertEqual(len(mail.outbox), count)
