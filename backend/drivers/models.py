from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce


def profile_picture_upload_to(instance, filename):
    """Keep user-provided filenames out of storage paths."""
    extension = Path(filename).suffix.lower()
    return f'driver_profiles/{instance.pk}/{uuid4().hex}{extension}'


class Driver(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
    ]
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='driver_profile',
    )
    name = models.CharField(max_length=200)
    sponsor = models.ForeignKey(
        'accounts.SponsorCompany',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='drivers',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    profile_picture = models.ImageField(
        upload_to=profile_picture_upload_to,
        blank=True,
        null=True,
        validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])],
    )
    # Store a normalized international number; blank means no contact number.
    phone_number = models.CharField(max_length=16, blank=True)

    def __str__(self):
        return self.name

    @property
    def point_balance(self):
        """Derive the current balance from the immutable transaction ledger."""
        return self.point_transactions.aggregate(
            balance=Coalesce(Sum('point_change'), Value(0)),
        )['balance']


class PointTransaction(models.Model):
    """An auditable, signed change to a driver's point balance."""

    driver = models.ForeignKey(
        Driver,
        on_delete=models.PROTECT,
        related_name='point_transactions',
    )
    sponsor = models.ForeignKey(
        'accounts.SponsorCompany',
        on_delete=models.PROTECT,
        related_name='point_transactions',
    )
    changed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='point_transactions_created',
    )
    point_change = models.IntegerField()
    reason = models.CharField(max_length=500)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-changed_at', '-id')
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(point_change=0),
                name='point_tx_change_nonzero',
            ),
        ]
        indexes = [
            models.Index(
                fields=('driver', '-changed_at'),
                name='point_tx_driver_time_idx',
            ),
            models.Index(
                fields=('sponsor', '-changed_at'),
                name='point_tx_sponsor_time_idx',
            ),
        ]

    def __str__(self):
        sign = '+' if self.point_change > 0 else ''
        return f'{self.driver}: {sign}{self.point_change} points'


class DriverStatusChange(models.Model):
    """Audit record of a sponsor rejecting or dropping a driver, with the reason."""

    REJECTED = 'rejected'
    DROPPED = 'dropped'
    ACTION_CHOICES = [
        (REJECTED, 'Rejected application'),
        (DROPPED, 'Dropped from sponsor'),
    ]

    driver = models.ForeignKey(
        Driver,
        on_delete=models.PROTECT,
        related_name='status_changes',
    )
    sponsor = models.ForeignKey(
        'accounts.SponsorCompany',
        on_delete=models.PROTECT,
        related_name='driver_status_changes',
    )
    changed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='driver_status_changes_made',
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    reason = models.CharField(max_length=500)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-changed_at', '-id')

    def __str__(self):
        return f'{self.driver}: {self.get_action_display()}'
