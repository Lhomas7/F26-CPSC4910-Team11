from django.conf import settings
from django.core.mail import EmailMessage

from accounts.models import DriverNotification


def notify_driver_mfa_change(driver, message, subject='Good Driver multi-factor authentication update'):
    """Record an in-app notification for a driver and email them if we have an address."""
    DriverNotification.objects.create(driver=driver, message=message)
    if driver.user.email:
        EmailMessage(
            subject=subject,
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[driver.user.email],
        ).send()