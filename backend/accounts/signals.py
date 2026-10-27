from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import PasswordHistory
from .password_validation import PASSWORD_HISTORY_DEPTH


@receiver(post_save, sender=settings.AUTH_USER_MODEL, dispatch_uid='remember_password')
def remember_password(sender, instance, created, update_fields=None, raw=False, **kwargs):
    """Keep the newest password hashes so PasswordHistoryValidator can refuse reuse.

    A post_save hook rather than set_password(), because create_user() and
    fixtures store a hash without calling set_password().
    """
    if raw or (update_fields is not None and 'password' not in update_fields):
        return
    encoded = instance.password
    if not encoded or encoded.startswith('!'):
        # No password, or one deliberately made unusable.
        return
    latest = PasswordHistory.objects.filter(user=instance).first()
    if latest is not None and latest.password_hash == encoded:
        return
    PasswordHistory.objects.create(user=instance, password_hash=encoded)
    stale = PasswordHistory.objects.filter(user=instance).values_list('pk', flat=True)[
        PASSWORD_HISTORY_DEPTH:
    ]
    PasswordHistory.objects.filter(pk__in=list(stale)).delete()
