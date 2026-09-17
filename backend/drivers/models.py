from django.conf import settings
from django.db import models


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

    def __str__(self):
        return self.name