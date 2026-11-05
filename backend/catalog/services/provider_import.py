"""Sponsor-scoped import of a fresh provider product snapshot."""

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException

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
            return product
    except IntegrityError as exc:
        raise ProductAlreadyImported() from exc
