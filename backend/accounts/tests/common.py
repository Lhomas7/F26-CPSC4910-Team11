from contextlib import contextmanager

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


class MailAssertMixin:
    @contextmanager
    def assertSendsMail(self, count):
        with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            mail.outbox = []
            yield
            self.assertEqual(len(mail.outbox), count)

