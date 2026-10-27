from django.db import transaction

from accounts.models import SponsorDriverAlert
from accounts.services.notify import notify_driver_dropped
from drivers.models import Driver, DriverStatusChange

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
    'driver to confirm they have an unassigned driver account.'
)


@transaction.atomic
def link_driver_to_sponsor(*, username, changed_by_user):
    """Link one unassigned driver to the sponsor as a pending application.

    Locking the driver prevents two organizations from linking the same
    account concurrently. An existing membership must be removed through the
    audited removal workflow before another link can be created.
    """
    sponsor_account = getattr(changed_by_user, 'sponsor_account', None)
    if not changed_by_user.is_active or sponsor_account is None:
        raise DriverMembershipError(
            'detail',
            'Only a sponsor can link a driver.',
            code='not_sponsor',
        )

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
            .select_related('user', 'sponsor')
            .get(user__username__iexact=username)
        )
    except Driver.DoesNotExist:
        raise DriverMembershipError(
            'detail', UNAVAILABLE_DRIVER_MESSAGE, code='driver_not_found'
        ) from None

    if driver.sponsor_id is not None:
        if driver.sponsor_id != sponsor_account.company_id:
            # Same answer, and same status, as an unknown username: a sponsor
            # must not be able to learn which accounts exist or who sponsors them.
            raise DriverMembershipError(
                'detail', UNAVAILABLE_DRIVER_MESSAGE, code='driver_not_found'
            )
        raise DriverMembershipError(
            'detail',
            'That driver is already linked to your organization.',
            code='already_linked',
        )

    driver.sponsor_id = sponsor_account.company_id
    driver.status = 'pending'
    driver.save(update_fields=['sponsor', 'status'])
    return driver


@transaction.atomic
def remove_driver_from_sponsor(*, driver, changed_by_user, reason):
    """Reject a pending driver or drop an approved one, with an audited reason.

    The driver is unlinked from the sponsor and reset to pending, so they can
    apply to another sponsor; their point history is left untouched. Returns
    the DriverStatusChange audit record.
    """
    sponsor_account = getattr(changed_by_user, 'sponsor_account', None)
    if not changed_by_user.is_active or sponsor_account is None:
        raise DriverMembershipError(
            'detail',
            'Only sponsor accounts can reject or drop drivers.',
            code='not_sponsor',
        )

    driver_id = driver.pk if isinstance(driver, Driver) else driver
    try:
        locked_driver = Driver.objects.select_for_update().get(pk=driver_id)
    except (Driver.DoesNotExist, TypeError, ValueError):
        raise DriverMembershipError(
            'driver',
            'The selected driver does not exist.',
            code='driver_not_found',
        ) from None

    if locked_driver.sponsor_id != sponsor_account.company_id:
        raise DriverMembershipError(
            'driver',
            'Sponsors can only manage drivers in their organization.',
            code='driver_outside_company',
        )

    action = (
        DriverStatusChange.DROPPED
        if locked_driver.status == 'approved'
        else DriverStatusChange.REJECTED
    )
    reason = normalize_reason(
        reason,
        subject='dropping this driver'
        if action == DriverStatusChange.DROPPED
        else 'rejecting this driver',
        error=lambda code, message: DriverMembershipError('reason', message, code=code),
    )

    return _end_membership(locked_driver, action, changed_by_user, reason)


ADMIN_REASSIGNMENT_REASON = 'An administrator changed your sponsor organization.'


@transaction.atomic
def reassign_driver_sponsor(*, driver, new_sponsor, changed_by_user):
    """Move a driver to another sponsor, or none, as an administrator.

    Leaving the current sponsor is audited and announced exactly like a sponsor
    removing the driver, so a driver is never silently moved. The new sponsor
    gets a pending application to approve. Assigning the current sponsor again
    changes nothing.
    """
    locked_driver = Driver.objects.select_for_update().get(pk=driver.pk)
    new_sponsor_id = new_sponsor.pk if new_sponsor is not None else None
    if locked_driver.sponsor_id == new_sponsor_id:
        return locked_driver

    if locked_driver.sponsor_id is not None:
        action = (
            DriverStatusChange.DROPPED
            if locked_driver.status == 'approved'
            else DriverStatusChange.REJECTED
        )
        _end_membership(locked_driver, action, changed_by_user, ADMIN_REASSIGNMENT_REASON)

    if new_sponsor_id is not None:
        locked_driver.sponsor_id = new_sponsor_id
        locked_driver.status = 'pending'
        locked_driver.save(update_fields=['sponsor', 'status'])
    return locked_driver


def _end_membership(locked_driver, action, changed_by_user, reason):
    """Audit, unlink, and tell the driver. The alert cannot be turned off."""
    sponsor = locked_driver.sponsor
    record = DriverStatusChange.objects.create(
        driver=locked_driver,
        sponsor=sponsor,
        changed_by_user=changed_by_user,
        action=action,
        reason=reason,
    )
    locked_driver.sponsor = None
    locked_driver.status = 'pending'
    locked_driver.save(update_fields=['sponsor', 'status'])
    # Sponsors of the old organization no longer follow this driver.
    SponsorDriverAlert.objects.filter(driver=locked_driver).delete()
    transaction.on_commit(
        lambda: notify_driver_dropped(
            locked_driver,
            sponsor.name,
            reason,
            rejected=action == DriverStatusChange.REJECTED,
        )
    )
    return record
