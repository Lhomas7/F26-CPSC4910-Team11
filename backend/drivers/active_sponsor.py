"""Which of a driver's sponsors scopes their catalog, cart, and point history.

Kept outside drivers.services, which imports the catalog cart service, so the
catalog can import this module without a cycle.
"""

from .models import DriverSponsorMembership

SESSION_KEY = 'active_sponsor_id'


def _approved(driver):
    return DriverSponsorMembership.objects.filter(
        driver=driver, status=DriverSponsorMembership.APPROVED
    )


def resolve_active_sponsor_id(driver, session=None):
    """The sponsor the driver is shopping with, or None without an approved one.

    A choice saved in the session is honored only while that membership is
    still approved. Otherwise a driver with one approved sponsor gets it by
    default, and a driver with several gets the first by name.
    """
    approved = _approved(driver)
    chosen = session.get(SESSION_KEY) if session is not None else None
    if isinstance(chosen, int) and approved.filter(sponsor_id=chosen).exists():
        return chosen
    return (
        approved.order_by('sponsor__name', 'sponsor_id')
        .values_list('sponsor_id', flat=True)
        .first()
    )


def display_sponsor_id(driver, session=None):
    """The sponsor to describe to a driver: the active one, else one they applied to.

    Lets a driver awaiting approval read about the sponsor they applied to,
    without granting catalog or point access.
    """
    sponsor_id = resolve_active_sponsor_id(driver, session)
    if sponsor_id is not None:
        return sponsor_id
    return (
        DriverSponsorMembership.objects.filter(
            driver=driver, status=DriverSponsorMembership.PENDING
        )
        .order_by('sponsor__name', 'sponsor_id')
        .values_list('sponsor_id', flat=True)
        .first()
    )


def set_active_sponsor(driver, session, sponsor_id):
    """Remember the driver's sponsor for this session. Returns False if not approved."""
    if not _approved(driver).filter(sponsor_id=sponsor_id).exists():
        return False
    session[SESSION_KEY] = sponsor_id
    return True
