from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from accounts.models import SponsorCompany
from catalog.models import CartItem, CatalogProduct
from catalog.pricing import point_cost

from .access import driver_catalog_scope


@dataclass(frozen=True)
class Cart:
    sponsor: SponsorCompany
    point_balance: int
    items: QuerySet[CartItem]

    @property
    def total_points(self):
        rate = self.sponsor.points_per_dollar
        return sum(point_cost(item.product.price_usd, rate) for item in self.items)


def _cart_items(scope):
    # Filter by the current sponsor as well as the driver: a row left behind
    # by a sponsor change must never show another organization's reward.
    return CartItem.objects.filter(
        driver_id=scope.driver_id,
        product__sponsor_id=scope.company_id,
    ).select_related('product')


def get_cart(*, user):
    """The driver's cart, including rewards that have since become unavailable."""
    scope = driver_catalog_scope(user)
    return Cart(
        sponsor=SponsorCompany.objects.get(pk=scope.company_id),
        point_balance=user.driver_profile.point_balance,
        items=_cart_items(scope),
    )


def cart_product_ids(*, user):
    """Product IDs in the driver's cart, for marking catalog cards."""
    scope = driver_catalog_scope(user)
    return set(_cart_items(scope).values_list('product_id', flat=True))


def add_to_cart(*, user, product_id):
    """Add a reward to the driver's cart. Returns (item, created).

    Adding a reward already in the cart is not an error: it returns the
    existing item so a double click or retry is harmless.
    """
    scope = driver_catalog_scope(user)
    # Scope before lookup: another organization's ID looks just like a missing ID.
    product = get_object_or_404(scope.restrict(CatalogProduct.objects.all()), pk=product_id)
    existing = CartItem.objects.filter(driver_id=scope.driver_id, product=product).first()
    if existing:
        return existing, False
    if not product.is_available:
        raise ValidationError(
            {'product_id': 'This reward is not available right now.'},
            code='product_unavailable',
        )
    try:
        with transaction.atomic():
            return CartItem.objects.create(driver_id=scope.driver_id, product=product), True
    except IntegrityError:
        # A concurrent request added it first.
        return CartItem.objects.get(driver_id=scope.driver_id, product=product), False


def remove_from_cart(*, user, product_id):
    """Remove a reward from the driver's cart. Removing a missing item is a 404."""
    scope = driver_catalog_scope(user)
    item = get_object_or_404(_cart_items(scope), product_id=product_id)
    item.delete()


def clear_cart(driver):
    """Empty a driver's cart, e.g. when they leave their sponsor organization."""
    CartItem.objects.filter(driver=driver).delete()
