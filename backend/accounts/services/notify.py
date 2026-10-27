import logging

from django.conf import settings
from django.core.mail import EmailMessage

from accounts.models import DriverNotificationPreferences, Notification

from .sms import send_sms

logger = logging.getLogger(__name__)


def _record(user, category, message):
    """Add an alert to the user's in-app notification center."""
    Notification.objects.create(user=user, category=category, message=message)


def notify_driver_mfa_change(
    driver, message, subject='Good Driver multi-factor authentication update'
):
    """Record an in-app notification for a driver and email them if we have an address."""
    _record(driver.user, Notification.SECURITY, message)
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
    account gets an email even though the reset itself required no login, plus
    an in-app notification.
    """
    message = (
        'The password for your Good Driver account was just reset. '
        'If this was not you, contact your sponsor or an administrator right away.'
    )
    _record(user, Notification.SECURITY, message)
    if user.email:
        EmailMessage(
            subject='Your Good Driver password was reset',
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        ).send()


def notify_unrecognized_sign_in(user):
    """Tell the account owner someone signed in on a device marked as not theirs.

    No device details are included: none are collected. The owner also gets an
    in-app notification.
    """
    message = (
        'Your Good Driver account was just signed in to on a device that was marked '
        'as shared or not yours. That session ends when the browser closes. If this '
        'was not you, change your password and contact your sponsor or an '
        'administrator right away.'
    )
    _record(user, Notification.SECURITY, message)
    if user.email:
        EmailMessage(
            subject='New sign-in to your Good Driver account',
            body=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        ).send()


def _points_phrase(amount):
    return f'{amount:,} point' if amount == 1 else f'{amount:,} points'


def notify_point_change(driver, point_change, reason, balance, sponsor_name):
    """Alert a driver that a sponsor added or removed points, if they want to know.

    The alert carries the reason and the resulting balance. It is recorded in-app
    and sent over each delivery channel the driver has turned on. A failure on one
    channel is logged and never stops the others.
    """
    preferences = DriverNotificationPreferences.for_driver(driver)
    added = point_change > 0
    if not (preferences.points_added_enabled if added else preferences.points_removed_enabled):
        return

    verb = 'added' if added else 'removed'
    preposition = 'to' if added else 'from'
    message = (
        f'{sponsor_name} {verb} {_points_phrase(abs(point_change))} {preposition} your '
        f'Good Driver account. Reason: {reason}. '
        f'Your balance is now {_points_phrase(balance)}.'
    )
    _record(
        driver.user, Notification.POINTS_ADDED if added else Notification.POINTS_REMOVED, message
    )

    if preferences.email_enabled and driver.user.email:
        try:
            EmailMessage(
                subject=f'Points {verb} {preposition} your Good Driver account',
                body=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[driver.user.email],
            ).send()
        except Exception:
            logger.exception('Could not email point change notification.')

    if preferences.sms_enabled and driver.phone_number:
        try:
            send_sms(driver.phone_number, message)
        except Exception:
            logger.exception('Could not text point change notification.')


def notify_driver_dropped(driver, sponsor_name, reason, *, rejected):
    """Tell a driver a sponsor dropped them or declined their application.

    This is a required affiliation notice: it is always recorded in-app and
    always emailed, whatever the driver's alert settings. A text is added only
    when the driver has turned texts on. A failure on one channel is logged and
    never stops the others.
    """
    if rejected:
        subject = f'{sponsor_name} declined your Good Driver application'
        message = (
            f'{sponsor_name} declined your application to its Good Driver program. '
            f'Reason: {reason}. You can be linked to another sponsor.'
        )
    else:
        subject = f'You were removed from the {sponsor_name} Good Driver program'
        message = (
            f'{sponsor_name} removed you from its Good Driver program. '
            f'Reason: {reason}. Your point history is kept, and you can be linked to '
            'another sponsor.'
        )
    _record(driver.user, Notification.SPONSOR_DROPPED, message)

    if driver.user.email:
        try:
            EmailMessage(
                subject=subject,
                body=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[driver.user.email],
            ).send()
        except Exception:
            logger.exception('Could not email sponsor removal notification.')

    preferences = DriverNotificationPreferences.for_driver(driver)
    if preferences.sms_enabled and driver.phone_number:
        try:
            send_sms(driver.phone_number, message)
        except Exception:
            logger.exception('Could not text sponsor removal notification.')
