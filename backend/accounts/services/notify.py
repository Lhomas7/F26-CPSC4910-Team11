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

def notify_password_reset(user):
    """Tell the account owner their password was just reset.

    This is the security signal for account takeover: the person who owns the
    account gets an email even though the reset itself required no login. Drivers
    also get an in-app notification.
    """
    message = (
        'The password for your Good Driver account was just reset. '
        'If this was not you, contact your sponsor or an administrator right away.'
    )
    if hasattr(user, 'driver_profile'):
        DriverNotification.objects.create(driver=user.driver_profile, message=message)
    if user.email:
        EmailMessage(
            subject='Your Good Driver password was reset',
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        ).send()


def notify_unrecognized_sign_in(user):
    """Tell the account owner someone signed in on a device marked as not theirs.

    No device details are included: none are collected. Drivers also get an
    in-app notification.
    """
    message = (
        'Your Good Driver account was just signed in to on a device that was marked '
        'as shared or not yours. That session ends when the browser closes. If this '
        'was not you, change your password and contact your sponsor or an '
        'administrator right away.'
    )
    if hasattr(user, 'driver_profile'):
        DriverNotification.objects.create(driver=user.driver_profile, message=message)
    if user.email:
        EmailMessage(
            subject='New sign-in to your Good Driver account',
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        ).send()
