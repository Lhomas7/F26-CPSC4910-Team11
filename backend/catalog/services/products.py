from django.core.exceptions import ValidationError as ModelValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from catalog.models import CatalogProduct
from catalog.serializers import ProductAvailabilitySerializer, ProductCreateSerializer

from .access import sponsor_catalog_scope


def _validate_model(product):
    try:
        product.full_clean()
    except ModelValidationError as error:
        raise ValidationError(error.message_dict) from error


@transaction.atomic
def create_catalog_product(*, user, data):
    scope = sponsor_catalog_scope(user)
    serializer = ProductCreateSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    # Ownership is always assigned here, not taken from the submitted payload.
    product = CatalogProduct(sponsor_id=scope.company_id, **serializer.validated_data)
    _validate_model(product)
    product.save()
    return product


@transaction.atomic
def update_product_availability(*, user, product_id, data):
    scope = sponsor_catalog_scope(user)
    # Scope before lookup: another organization's ID looks just like a missing
    # ID. Lock the owned row so concurrent availability writes are serialized.
    product = get_object_or_404(
        scope.restrict(CatalogProduct.objects.select_for_update()),
        pk=product_id,
    )
    serializer = ProductAvailabilitySerializer(data=data)
    serializer.is_valid(raise_exception=True)
    available = serializer.validated_data['is_available']
    if product.is_available != available:
        product.is_available = available
        # Do not save stale copies of unrelated fields during a narrow update.
        product.save(update_fields=['is_available', 'updated_at'])
    return product
