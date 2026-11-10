import logging

from django.conf import settings
from django.core.mail import EmailMessage

from accounts.models import (
    DriverNotificationPreferences,
    Notification,
    SponsorDriverAlert,
    SponsorNotificationPreferences,
)

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
    try:
        _record(
            driver.user,
            Notification.POINTS_ADDED if added else Notification.POINTS_REMOVED,
            message,
        )
    except Exception:
        logger.exception('Could not record point change notification.')

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


def notify_sponsors_of_point_change(driver, point_change, reason, balance, changed_by_user):
    """Alert the sponsors who asked to hear when this driver gains or loses points.

    Only sponsors in the driver's current organization are alerted, including
    the sponsor who made the change. Each alert is recorded in-app and also
    emailed to sponsors who turned email on. A failure for one sponsor is
    logged and never stops the others.
    """
    added = point_change > 0
    direction = {'on_points_added' if added else 'on_points_removed': True}
    subscriptions = SponsorDriverAlert.objects.filter(
        driver=driver,
        sponsor_account__company_id=driver.sponsor_id,
        sponsor_account__user__is_active=True,
        **direction,
    ).select_related('sponsor_account__user')

    verb = 'gained' if added else 'lost'
    actor = changed_by_user.get_full_name() or changed_by_user.get_username()
    message = (
        f'{driver.name} {verb} {_points_phrase(abs(point_change))}. Reason: {reason}. '
        f'Their balance is now {_points_phrase(balance)}. Changed by {actor}.'
    )
    for subscription in subscriptions:
        sponsor_account = subscription.sponsor_account
        user = sponsor_account.user
        try:
            _record(user, Notification.DRIVER_POINTS, message)
            if (
                user.email
                and SponsorNotificationPreferences.for_sponsor(sponsor_account).email_enabled
            ):
                EmailMessage(
                    subject=f'{driver.name} {verb} points',
                    body=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[user.email],
                ).send()
        except Exception:
            logger.exception('Could not send a driver point alert to a sponsor.')


def notify_sponsors_of_new_driver_application(driver):
    """Notify every active sponsor account in the organization of a new application."""
    from accounts.models import SponsorAccount

    if driver.sponsor_id is None:
        return
    message = (
        f'{driver.name} has applied to join your Good Driver program. '
        'Review the application in your driver directory.'
    )
    sponsor_accounts = SponsorAccount.objects.filter(
        company_id=driver.sponsor_id,
        user__is_active=True,
    ).select_related('user')
    for sponsor_account in sponsor_accounts:
        try:
            _record(sponsor_account.user, Notification.DRIVER_APPLICATION, message)
        except Exception:
            logger.exception('Could not record a new driver application notification.')


def notify_drivers_of_new_product(product):
    """Tell the sponsor's approved drivers a new reward is in their catalog.

    In-app only: a busy catalog would otherwise flood inboxes and phones.
    Drivers without a preferences row get the default, which is on.
    """
    from drivers.models import Driver

    sponsor_name = product.sponsor.name
    prefix = f'New reward in the {sponsor_name} catalog: '
    name = product.name
    limit = Notification._meta.get_field('message').max_length
    if len(prefix) + len(name) > limit:
        name = name[: limit - len(prefix) - 1] + '…'
    message = prefix + name

    drivers = (
        Driver.objects.filter(
            sponsor_id=product.sponsor_id,
            status='approved',
            user__is_active=True,
        )
        .exclude(notification_preferences__new_products_enabled=False)
        .values_list('user_id', flat=True)
    )
    try:
        Notification.objects.bulk_create(
            Notification(user_id=user_id, category=Notification.CATALOG_PRODUCT, message=message)
            for user_id in drivers
        )
    except Exception:
        logger.exception('Could not record new reward notifications.')


def _purchase_alert(items, totals):
    """One-line purchase alert, listing as many items as fit in a notification."""
    limit = Notification._meta.get_field('message').max_length
    for shown in range(len(items), 0, -1):
        hidden = len(items) - shown
        listed = ', '.join(items[:shown]) + (f', and {hidden} more' if hidden else '')
        message = f'Order confirmed. Items: {listed}. {totals}'
        if len(message) <= limit:
            return message
    return f'Order confirmed. {len(items)} items. {totals}'[:limit]


def notify_reward_purchase(driver, purchase):
    """Confirm a driver's reward purchase in-app and, if they allow it, by email.

    `purchase` is the checkout receipt: each item ordered with its point price,
    the points used and the new balance. Each channel fails independently.
    """
    preferences = DriverNotificationPreferences.for_driver(driver)
    if not preferences.points_removed_enabled:
        return

    items = [(row['name'], _points_phrase(row['unit_points'])) for row in purchase.line_items]
    points_used = _points_phrase(purchase.points_spent)
    balance = _points_phrase(purchase.point_balance)
    try:
        _record(
            driver.user,
            Notification.POINTS_REMOVED,
            _purchase_alert(
                [f'{name} ({price})' for name, price in items],
                f'Points used: {points_used}. New balance: {balance}.',
            ),
        )
    except Exception:
        logger.exception('Could not record a reward purchase notification.')

    if preferences.email_enabled and driver.user.email:
        lines = '\n'.join(f'  - {name}: {price}' for name, price in items)
        body = (
            f'Hi {driver.name},\n\n'
            'Your Good Driver reward order was submitted.\n\n'
            f'Items ordered:\n{lines}\n\n'
            f'Points used: {points_used}\n'
            f'New balance: {balance}\n\n'
            'You can see this purchase in your point history.'
        )
        try:
            EmailMessage(
                subject='Your Good Driver reward order is confirmed',
                body=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[driver.user.email],
            ).send()
        except Exception:
            logger.exception('Could not email a reward purchase confirmation.')
