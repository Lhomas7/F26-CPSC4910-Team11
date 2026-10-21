"""Resolve catalog ownership without choosing product or pricing contracts."""

from dataclasses import dataclass
from types import SimpleNamespace

from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from accounts.permissions import DriverAccount, MFAEnrolled, SponsorAccount


@dataclass(frozen=True)
class CatalogScope:
    company_id: int
    driver_id: int | None = None
    driver_status: str | None = None

    def restrict(self, queryset):
        """Scope a sponsor-owned queryset before looking up individual records.

        Catalog records will use a `sponsor` foreign key. Filtering before a
        lookup avoids revealing whether another organization's record exists.
        """
        return queryset.filter(sponsor_id=self.company_id)


def _require_access(user, role_permission):
    if not user or not user.is_authenticated:
        raise NotAuthenticated()
    if not user.is_active:
        raise PermissionDenied('An active account is required.', code='inactive_account')

    # Accept the effective request.user, not request.real_user: View-As must
    # retain the target's permissions rather than inherit administrator access.
    request = SimpleNamespace(user=user)
    for permission in (role_permission(), MFAEnrolled()):
        if not permission.has_permission(request, None):
            raise PermissionDenied(permission.message)


def sponsor_catalog_scope(user):
    """Resolve ownership from the sponsor account, never browser-supplied IDs."""
    _require_access(user, SponsorAccount)
    return CatalogScope(company_id=user.sponsor_account.company_id)


def driver_catalog_scope(user):
    """Resolve the driver's organization, not their eventual browsing eligibility.

    Pending/approved browsing policy is still a product decision. Preserve that
    status for the future endpoint rather than silently choosing a policy here.
    """
    _require_access(user, DriverAccount)
    driver = user.driver_profile
    if driver.sponsor_id is None:
        raise PermissionDenied(
            'A sponsor organization is required to access its catalog.',
            code='sponsor_required',
        )
    return CatalogScope(
        company_id=driver.sponsor_id,
        driver_id=driver.pk,
        driver_status=driver.status,
    )
