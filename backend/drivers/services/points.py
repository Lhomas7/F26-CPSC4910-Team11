from dataclasses import dataclass

from django.db import transaction

from drivers.models import Driver, PointTransaction

from .reasons import MAX_REASON_LENGTH, normalize_reason

MAX_POINT_ADJUSTMENT = 1_000_000
MAX_POINT_REASON_LENGTH = MAX_REASON_LENGTH


class PointAdjustmentError(ValueError):
    """A safe, field-specific error raised by the point domain service."""

    def __init__(self, field, message, *, code):
        super().__init__(message)
        self.field = field
        self.message = message
        self.code = code


@dataclass(frozen=True)
class PointAdjustmentResult:
    transaction: PointTransaction
    balance: int


def _validated_point_change(value):
    # bool is an int subclass, but accepting True as one point is surprising.
    if isinstance(value, bool) or not isinstance(value, int):
        raise PointAdjustmentError(
            'point_change',
            'Enter a whole-number point adjustment.',
            code='invalid_amount',
        )
    if value == 0:
        raise PointAdjustmentError(
            'point_change',
            'Point adjustments cannot be zero.',
            code='zero_amount',
        )
    if abs(value) > MAX_POINT_ADJUSTMENT:
        raise PointAdjustmentError(
            'point_change',
            f'Point adjustments cannot exceed {MAX_POINT_ADJUSTMENT:,} points.',
            code='amount_too_large',
        )
    return value


def _normalized_reason(value):
    return normalize_reason(
        value,
        subject='this point adjustment',
        error=lambda code, message: PointAdjustmentError('reason', message, code=code),
    )


def _sponsor_company_id(user):
    if not user or not user.is_authenticated or not user.is_active:
        raise PointAdjustmentError(
            'detail',
            'An active sponsor account is required.',
            code='not_sponsor',
        )
    sponsor_account = getattr(user, 'sponsor_account', None)
    if sponsor_account is None:
        raise PointAdjustmentError(
            'detail',
            'Only sponsor accounts can adjust driver points.',
            code='not_sponsor',
        )
    return sponsor_account.company_id


@transaction.atomic
def adjust_driver_points(*, driver, changed_by_user, point_change, reason):
    """Create one authorized adjustment and return its resulting balance.

    Locking the driver serializes balance-changing operations performed through
    this service, preventing concurrent deductions from spending the same
    points. All application point changes must pass through this function.
    """
    point_change = _validated_point_change(point_change)
    reason = _normalized_reason(reason)
    sponsor_id = _sponsor_company_id(changed_by_user)

    driver_id = driver.pk if isinstance(driver, Driver) else driver
    try:
        locked_driver = (
            Driver.objects.select_for_update().select_related('sponsor').get(pk=driver_id)
        )
    except (Driver.DoesNotExist, TypeError, ValueError):
        raise PointAdjustmentError(
            'driver',
            'The selected driver does not exist.',
            code='driver_not_found',
        ) from None

    if locked_driver.sponsor_id != sponsor_id:
        raise PointAdjustmentError(
            'driver',
            'Sponsors can only adjust points for drivers in their organization.',
            code='driver_outside_company',
        )

    if locked_driver.status != 'approved':
        raise PointAdjustmentError(
            'driver',
            'Points can only be adjusted for approved drivers.',
            code='driver_not_approved',
        )

    current_balance = locked_driver.point_balance
    resulting_balance = current_balance + point_change
    if resulting_balance < 0:
        raise PointAdjustmentError(
            'point_change',
            f'This deduction exceeds the driver’s current balance of {current_balance}.',
            code='insufficient_points',
        )

    entry = PointTransaction.objects.create(
        driver=locked_driver,
        sponsor_id=sponsor_id,
        changed_by_user=changed_by_user,
        point_change=point_change,
        reason=reason,
    )
    return PointAdjustmentResult(transaction=entry, balance=resulting_balance)
