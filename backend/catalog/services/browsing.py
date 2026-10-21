from dataclasses import dataclass

from django.db.models import QuerySet
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from accounts.models import SponsorCompany
from accounts.services import get_account_type
from catalog.models import CatalogProduct

from .access import driver_catalog_scope, sponsor_catalog_scope


@dataclass(frozen=True)
class CatalogListing:
    sponsor: SponsorCompany
    point_balance: int | None
    products: QuerySet[CatalogProduct]


def browse_catalog(*, user):
    """Resolve the effective user's catalog before counting or paging products."""
    if not user or not user.is_authenticated:
        raise NotAuthenticated()
    role = get_account_type(user)
    if role == 'sponsor':
        scope = sponsor_catalog_scope(user)
        balance = None  # Sponsors do not have a Driver's spending balance.
    elif role == 'driver':
        scope = driver_catalog_scope(user)
        # Reuse the ledger-derived balance; catalog reads never adjust points or
        # create notifications, and never calculate an invented conversion rate.
        balance = user.driver_profile.point_balance
    else:
        raise PermissionDenied('Only driver and sponsor accounts can browse a catalog.')
    return CatalogListing(
        sponsor=SponsorCompany.objects.get(pk=scope.company_id),
        point_balance=balance,
        # Keep unavailable rewards visible so Drivers can see their status.
        products=scope.restrict(CatalogProduct.objects.all()),
    )
