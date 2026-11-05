"""Sponsor-scoped import of a fresh provider product snapshot."""

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException
from accounts.services.notify import notify_drivers_of_new_product

from catalog.fake_store import get_product
from catalog.models import CatalogProduct

from .access import sponsor_catalog_scope


class ProductAlreadyImported(APIException):
    status_code = 409
    default_detail = 'This product is already in your catalog.'
    default_code = 'product_already_imported'


def import_provider_product(*, user, product_id):
    scope = sponsor_catalog_scope(user)
    # Fetch again on import: the browser's preview is never trusted as price.
    details = get_product(product_id)
    try:
        with transaction.atomic():
            if CatalogProduct.objects.filter(
                sponsor_id=scope.company_id,
                provider=details['provider'],
                external_product_id=details['external_product_id'],
            ).exists():
                raise ProductAlreadyImported()
            product = CatalogProduct(
                sponsor_id=scope.company_id, last_synced_at=timezone.now(), **details
            )
            product.full_clean()
            product.save()
            if product.is_available:
                transaction.on_commit(lambda: notify_drivers_of_new_product(product), robust=True)
            return product
    except IntegrityError as exc:
        raise ProductAlreadyImported() from exc


def refresh_provider_product(*, product_id, user=None):
    """Refresh details and price, preserving the Sponsor's listing choice."""
    queryset = CatalogProduct.objects.filter(provider='fake_store')
    if user is not None:
        scope = sponsor_catalog_scope(user)
        queryset = scope.restrict(queryset)
    product = get_object_or_404(queryset, pk=product_id)
    details = get_product(int(product.external_product_id))
    with transaction.atomic():
        product = get_object_or_404(queryset.select_for_update(), pk=product_id)
        for field in ('name', 'description', 'image_url', 'price_usd'):
            setattr(product, field, details[field])
        product.last_synced_at = timezone.now()
        product.full_clean()
        product.save(update_fields=['name', 'description', 'image_url', 'price_usd',
                                    'last_synced_at', 'updated_at'])
    return product
