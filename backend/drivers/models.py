from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models


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

    def __str__(self):
        return self.name
