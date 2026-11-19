from django.db import transaction

from accounts.models import SponsorCompany, SponsorDriverAlert
from accounts.services.notify import (
    notify_driver_added,
    notify_driver_dropped,
    notify_sponsors_of_new_driver_application,
)
from catalog.services.cart import clear_cart
from drivers.models import Driver, DriverSponsorMembership, DriverStatusChange

from .reasons import normalize_reason


class DriverMembershipError(ValueError):
    """A safe, field-specific error raised when changing a driver's sponsor."""

    def __init__(self, field, message, *, code):
        super().__init__(message)
        self.field = field
        self.message = message
        self.code = code


UNAVAILABLE_DRIVER_MESSAGE = (
    'No driver can be linked with that username. Check the spelling, or ask the '
    'driver to confirm they have a driver account.'
)


def _sponsor_company_id(user, message):
    sponsor_account = getattr(user, 'sponsor_account', None)
    if not user.is_active or sponsor_account is None:
        raise DriverMembershipError('detail', message, code='not_sponsor')
    return sponsor_account.company_id


def _lock_driver(driver):
    """Lock the driver so concurrent membership changes for them serialize."""
    driver_id = driver.pk if isinstance(driver, Driver) else driver
    try:
        return Driver.objects.select_for_update().get(pk=driver_id)
    except (Driver.DoesNotExist, TypeError, ValueError):
        raise DriverMembershipError(
            'driver',
            'The selected driver does not exist.',
            code='driver_not_found',
        ) from None


def _audit(membership, action, changed_by_user, reason=''):
    return DriverStatusChange.objects.create(
        driver=membership.driver,
        sponsor=membership.sponsor,
        changed_by_user=changed_by_user,
        action=action,
        reason=reason,
    )


def open_application(*, driver, sponsor, changed_by_user):
    """Create or reopen a pending application. The caller must lock the driver.

    Returns the membership, or None when the driver already has an active
    application or membership with this sponsor.
    """
    membership, created = DriverSponsorMembership.objects.get_or_create(
        driver=driver, sponsor=sponsor
    )
    if not created:
        if membership.is_active:
            return None
        membership.status = DriverSponsorMembership.PENDING
        membership.save(update_fields=['status', 'updated_at'])
    _audit(membership, DriverStatusChange.APPLIED, changed_by_user)
    transaction.on_commit(
        lambda: notify_sponsors_of_new_driver_application(driver, sponsor.pk), robust=True
    )
    return membership


@transaction.atomic
def link_driver_to_sponsor(*, username, changed_by_user):
    """Invite a driver to the sponsor's organization as a pending application.

    Other sponsors' memberships are untouched and never revealed: an unknown
    username gets the same answer as any other failure to find a driver.
    """
    company_id = _sponsor_company_id(changed_by_user, 'Only a sponsor can link a driver.')

    username = (username or '').strip()
    if not username:
        raise DriverMembershipError(
            'detail',
            'Username is required.',
            code='missing_username',
        )

    try:
        driver = (
            Driver.objects.select_for_update()
            .select_related('user')
            .get(user__username__iexact=username)
        )
    except Driver.DoesNotExist:
        raise DriverMembershipError(
            'detail', UNAVAILABLE_DRIVER_MESSAGE, code='driver_not_found'
        ) from None

    sponsor = SponsorCompany.objects.get(pk=company_id)
    if open_application(driver=driver, sponsor=sponsor, changed_by_user=changed_by_user) is None:
        raise DriverMembershipError(
            'detail',
            'That driver is already linked to your organization.',
            code='already_linked',
        )
    return driver


def _active_membership(driver, sponsor_id):
    membership = (
        # of=('self',) locks only the membership, not the sponsor checkout locks.
        DriverSponsorMembership.objects.select_for_update(of=('self',))
        .select_related('sponsor', 'driver__user')
        .filter(driver=driver, sponsor_id=sponsor_id)
        .first()
    )
    if membership is None or not membership.is_active:
        raise DriverMembershipError(
            'driver',
            'Sponsors can only manage drivers in their organization.',
            code='driver_outside_company',
        )
    return membership


@transaction.atomic
def approve_driver_application(*, driver, changed_by_user):
    """Approve a pending application to the sponsor's organization.

    Approving an already approved driver changes nothing. Returns the membership.
    """
    company_id = _sponsor_company_id(
        changed_by_user, 'Only sponsor accounts can approve drivers.'
    )
    membership = _active_membership(_lock_driver(driver), company_id)
    if membership.status == DriverSponsorMembership.APPROVED:
        return membership

    membership.status = DriverSponsorMembership.APPROVED
    membership.save(update_fields=['status', 'updated_at'])
    _audit(membership, DriverStatusChange.APPROVED, changed_by_user)
    sponsor_name = membership.sponsor.name
    transaction.on_commit(
        lambda: notify_driver_added(membership.driver, sponsor_name, approved=True),
        robust=True,
    )
    return membership


@transaction.atomic
def remove_driver_from_sponsor(*, driver, changed_by_user, reason):
    """Reject a pending driver or drop an approved one, with an audited reason.

    Only the sponsor's own membership changes; the driver keeps every other
    sponsor and all point history. Returns the DriverStatusChange record.
    """
    company_id = _sponsor_company_id(
        changed_by_user, 'Only sponsor accounts can reject or drop drivers.'
    )
    membership = _active_membership(_lock_driver(driver), company_id)

    rejecting = membership.status == DriverSponsorMembership.PENDING
    reason = normalize_reason(
        reason,
        subject='rejecting this driver' if rejecting else 'dropping this driver',
        error=lambda code, message: DriverMembershipError('reason', message, code=code),
    )
    return _end_membership(
        membership,
        DriverStatusChange.REJECTED if rejecting else DriverStatusChange.DROPPED,
        changed_by_user,
        reason,
        rejected=rejecting,
    )


@transaction.atomic
def admin_assign_sponsors(*, driver, sponsors, changed_by_user, notify=True):
    """Add a driver to sponsors as an administrator, approved immediately.

    Sponsors the driver is already approved with are left alone. Each new
    approval is audited, and announced unless `notify` is False (an account
    the administrator is creating right now). Returns the memberships that changed.
    """
    locked_driver = _lock_driver(driver)
    changed = []
    for sponsor in sponsors:
        membership, _ = DriverSponsorMembership.objects.get_or_create(
            driver=locked_driver, sponsor=sponsor
        )
        if membership.status == DriverSponsorMembership.APPROVED:
            continue
        was_pending = membership.status == DriverSponsorMembership.PENDING
        membership.status = DriverSponsorMembership.APPROVED
        membership.save(update_fields=['status', 'updated_at'])
        _audit(membership, DriverStatusChange.ASSIGNED, changed_by_user)
        changed.append(membership)
        if notify:
            transaction.on_commit(
                lambda name=sponsor.name, approved=was_pending: notify_driver_added(
                    locked_driver, name, approved=approved
                ),
                robust=True,
            )
    return changed


@transaction.atomic
def admin_remove_sponsor(*, driver, sponsor_id, changed_by_user, reason):
    """Remove one of a driver's memberships as an administrator, with a reason."""
    locked_driver = _lock_driver(driver)
    membership = (
        DriverSponsorMembership.objects.select_for_update(of=('self',))
        .select_related('sponsor', 'driver__user')
        .filter(driver=locked_driver, sponsor_id=sponsor_id)
        .first()
    )
    if membership is None or not membership.is_active:
        raise DriverMembershipError(
            'sponsor',
            'This driver is not in that sponsor organization.',
            code='membership_not_found',
        )
    reason = normalize_reason(
        reason,
        subject='removing this driver from the sponsor',
        error=lambda code, message: DriverMembershipError('reason', message, code=code),
    )
    return _end_membership(
        membership,
        DriverStatusChange.REMOVED,
        changed_by_user,
        reason,
        # Removing an application that was never approved is a rejection.
        rejected=membership.status == DriverSponsorMembership.PENDING,
    )


def _end_membership(membership, action, changed_by_user, reason, *, rejected):
    """Audit, close one membership, and tell the driver. The alert cannot be turned off."""
    driver = membership.driver
    sponsor = membership.sponsor
    record = _audit(membership, action, changed_by_user, reason)
    membership.status = (
        DriverSponsorMembership.REJECTED if rejected else DriverSponsorMembership.DROPPED
    )
    membership.save(update_fields=['status', 'updated_at'])
    # That organization's sponsors no longer follow this driver.
    SponsorDriverAlert.objects.filter(
        driver=driver, sponsor_account__company_id=sponsor.pk
    ).delete()
    # Cart rewards from that organization's catalog can no longer be bought.
    clear_cart(driver, sponsor.pk)
    transaction.on_commit(
        lambda: notify_driver_dropped(
            driver,
            sponsor.name,
            reason,
            rejected=rejected,
        ),
        robust=True,
    )
    return record
