"""Test helpers for building drivers with sponsor memberships."""

from .models import Driver, DriverSponsorMembership


def create_driver(*, sponsor=None, status=DriverSponsorMembership.PENDING, **fields):
    """Create a driver, plus a membership with `sponsor` in `status` when given."""
    driver = Driver.objects.create(**fields)
    if sponsor is not None:
        add_membership(driver, sponsor, status)
    return driver


def add_membership(driver, sponsor, status=DriverSponsorMembership.APPROVED):
    membership, _ = DriverSponsorMembership.objects.update_or_create(
        driver=driver, sponsor=sponsor, defaults={'status': status}
    )
    return membership


def membership_status(driver, sponsor):
    """The driver's status with one sponsor, or None without a membership."""
    return (
        DriverSponsorMembership.objects.filter(driver=driver, sponsor=sponsor)
        .values_list('status', flat=True)
        .first()
    )
