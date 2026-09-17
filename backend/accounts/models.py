from django.conf import settings
from django.db import models


class SponsorCompany(models.Model):
    name = models.CharField(max_length=200, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


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