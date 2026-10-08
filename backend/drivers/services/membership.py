from django.db import transaction

from drivers.models import Driver, DriverStatusChange

from .reasons import normalize_reason


class DriverMembershipError(ValueError):
    """A safe, field-specific error raised when changing a driver's sponsor."""

    def __init__(self, field, message, *, code):
        super().__init__(message)
        self.field = field
        self.message = message
        self.code = code


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
            'detail',
            f'No driver found with username "{username}".',
            code='driver_not_found',
        ) from None

    if driver.sponsor_id is not None:
        message = (
            'That driver is already linked to your organization.'
            if driver.sponsor_id == sponsor_account.company_id
            else 'That driver is already assigned to another sponsor.'
        )
        raise DriverMembershipError(
            'detail',
            message,
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
        subject='dropping this driver' if action == DriverStatusChange.DROPPED else 'rejecting this driver',
        error=lambda code, message: DriverMembershipError('reason', message, code=code),
    )

    record = DriverStatusChange.objects.create(
        driver=locked_driver,
        sponsor_id=sponsor_account.company_id,
        changed_by_user=changed_by_user,
        action=action,
        reason=reason,
    )
    locked_driver.sponsor = None
    locked_driver.status = 'pending'
    locked_driver.save(update_fields=['sponsor', 'status'])
    return record
