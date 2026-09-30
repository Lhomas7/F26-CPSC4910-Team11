from django.conf import settings
from django.db import models


class SponsorCompany(models.Model):
    name = models.CharField(max_length=200, unique=True)
    driver_mfa_required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class LoginAttempt(models.Model):
    username = models.CharField(max_length=150)
    timestamp = models.DateTimeField(auto_now_add=True)
    successful = models.BooleanField()

    def __str__(self):
        result = 'Success' if self.successful else 'Failure'
        return f'{self.username} - {result} - {self.timestamp}'

class SponsorAccount(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sponsor_account',
    )
    company = models.ForeignKey(
        SponsorCompany,
        on_delete=models.CASCADE,
        related_name='sponsor_accounts',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.user.get_username()


class MFASettings(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mfa_settings',
    )
    totp_secret_encrypted = models.BinaryField(null=True, blank=True)
    totp_enabled = models.BooleanField(default=False)
    email_enabled = models.BooleanField(default=False)
    sms_enabled = models.BooleanField(default=False)
    phone_number = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def any_enabled(self):
        return self.totp_enabled or self.email_enabled or self.sms_enabled

    def enabled_methods(self):
        return [m for m in ('email', 'sms', 'totp') if getattr(self, f'{m}_enabled')]


class MFACode(models.Model):
    PURPOSE_CHOICES = [('enroll', 'Enroll'), ('login', 'Login'), ('reset', 'Reset')]
    METHOD_CHOICES = [('email', 'Email'), ('sms', 'SMS')]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='mfa_codes')
    purpose = models.CharField(max_length=10, choices=PURPOSE_CHOICES)
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'purpose', 'used'], name='mfacode_user_purpose_used_idx'),
        ]


class DriverNotification(models.Model):
    driver = models.ForeignKey('drivers.Driver', on_delete=models.CASCADE, related_name='notifications')
    message = models.CharField(max_length=500)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class AdminImpersonationEvent(models.Model):
    """Append-only audit record for an administrator's view-as session."""

    ACTION_CHOICES = [
        ('start', 'Started'),
        ('stop', 'Stopped'),
        ('expire', 'Expired'),
    ]
    ROLE_CHOICES = [('driver', 'Driver'), ('sponsor', 'Sponsor')]

    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='impersonation_events_started',
    )
    target = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='impersonation_events_received',
    )
    target_role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)
