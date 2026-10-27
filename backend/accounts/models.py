from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator
from django.db import models

from .fields import EncryptedCharField


def account_profile_picture_upload_to(instance, filename):
    """Store non-driver avatars without exposing user-provided filenames."""
    extension = Path(filename).suffix.lower()
    return f'account_profiles/{instance.user_id}/{uuid4().hex}{extension}'


class AccountProfile(models.Model):
    """Profile data shared by application users without a Driver record."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='account_profile',
    )
    profile_picture = models.ImageField(
        upload_to=account_profile_picture_upload_to,
        blank=True,
        null=True,
        validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])],
    )

    def __str__(self):
        return self.user.get_username()


class SponsorCompany(models.Model):
    name = models.CharField(max_length=200, unique=True)
    # Organization-wide catalog pricing, not a cash value for a Driver's balance.
    # Bound the rate so even the maximum product price remains a safe JS integer.
    points_per_dollar = models.PositiveIntegerField(
        default=100, validators=[MinValueValidator(1), MaxValueValidator(100000)],
    )
    driver_mfa_required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(points_per_dollar__gte=1, points_per_dollar__lte=100000),
                name='sponsor_catalog_rate_range',
            ),
        ]

    def __str__(self):
        return self.name


class LoginAttempt(models.Model):
    # Linked by FK (not just username) so history follows the account through
    # username changes. Null for attempts against usernames that don't exist.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='login_attempts',
    )
    username = models.CharField(max_length=150)
    timestamp = models.DateTimeField(auto_now_add=True)
    successful = models.BooleanField()

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', '-timestamp']),
            # Serves the sign-in lockout count (services/login_throttle.py).
            models.Index(
                fields=['username', 'successful', 'timestamp'],
                name='loginattempt_throttle_idx',
            ),
        ]

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
    # Verified number that sign-in and reset codes are sent to.
    phone_number = EncryptedCharField(null=True, blank=True)
    # Number entered during SMS setup, held here until its enroll code is
    # verified so an unconfirmed number never receives sign-in codes.
    pending_phone_number = EncryptedCharField(null=True, blank=True)
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
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='mfa_codes'
    )
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


class MFABackupCode(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mfa_backup_codes',
    )
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'used_at'], name='mfabackup_user_used_idx'),
        ]


class RegistrationSettings(models.Model):
    """Site-wide account creation options, edited by administrators.

    A single row (pk=1); use RegistrationSettings.load() rather than querying.
    """

    email_verification_required = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        settings_row, _ = cls.objects.get_or_create(pk=1)
        return settings_row


class RegistrationEmailCode(models.Model):
    """One-time code proving control of an email address during signup.

    Keyed by email rather than user because the account does not exist yet.
    """

    email = models.EmailField(max_length=254)
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['email', 'used'], name='regcode_email_used_idx'),
        ]


class Notification(models.Model):
    """An in-app alert shown in the user's notification center.

    One-time verification and sign-in codes are never stored here: they are
    delivered by email or text only, so they cannot be read back later.
    """

    POINTS_ADDED = 'points_added'
    POINTS_REMOVED = 'points_removed'
    SPONSOR_DROPPED = 'sponsor_dropped'
    SECURITY = 'security'
    DRIVER_POINTS = 'driver_points'
    CATEGORY_CHOICES = [
        (POINTS_ADDED, 'Points added'),
        (POINTS_REMOVED, 'Points removed'),
        (SPONSOR_DROPPED, 'Dropped from sponsor'),
        (SECURITY, 'Account security'),
        (DRIVER_POINTS, "A driver's points changed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications'
    )
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    # Room for a 500-character point reason plus the surrounding alert text.
    message = models.CharField(max_length=1000)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['user', 'read', 'created_at'], name='notification_user_read_idx'),
        ]


class DriverNotificationPreferences(models.Model):
    """Which point-change alerts a driver wants and how they are delivered.

    Rows are created on first use; use DriverNotificationPreferences.for_driver()
    rather than querying so drivers without a row get the defaults.
    """

    driver = models.OneToOneField(
        'drivers.Driver',
        on_delete=models.CASCADE,
        related_name='notification_preferences',
    )
    points_added_enabled = models.BooleanField(default=True)
    points_removed_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    # The driver contact number is unverified, so texts are opt-in.
    sms_enabled = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def for_driver(cls, driver):
        preferences, _ = cls.objects.get_or_create(driver=driver)
        return preferences


class AdminImpersonationEvent(models.Model):
    """Append-only audit record for an administrator's view-as session."""

    ACTION_CHOICES = [
        ('start', 'Started'),
        ('stop', 'Stopped'),
        ('expire', 'Expired'),
        ('invalidate', 'Invalidated'),
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
    reason = models.CharField(max_length=64, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)


class AdminPasswordResetEvent(models.Model):
    """Append-only audit record for resetting an administrator's password."""

    ACTION_CHOICES = [
        ('requested', 'Requested'),
        ('completed', 'Completed'),
        ('failed', 'Failed second factor'),
    ]

    target = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='admin_password_reset_events',
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='admin_password_resets_requested',
    )
    action = models.CharField(max_length=12, choices=ACTION_CHOICES)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)


class TrustedDevice(models.Model):
    """A browser the user said is theirs when asked "Is this your device?".

    The browser holds a random token in an HttpOnly cookie; only its SHA-256 is
    stored here. Nothing about the device itself (IP, user agent, location) is
    recorded. One browser token can be trusted by several accounts.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='trusted_devices',
    )
    token_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'token_hash'], name='trusteddevice_user_token_idx'),
        ]

    def __str__(self):
        return f'{self.user} - trusted {self.created_at:%Y-%m-%d}'
