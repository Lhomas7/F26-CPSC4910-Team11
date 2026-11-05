from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from accounts.models import SponsorCompany
from accounts.services.notify import notify_reward_purchase
from catalog.models import CartItem, CatalogProduct, Redemption, RedemptionItem
from catalog.pricing import point_cost
from reports.models import CompletedSale
from django.utils import timezone
from drivers.models import Driver

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


@dataclass(frozen=True)
class Purchase:
    items: list[str]
    points_spent: int
    point_balance: int
    redemption_id: int
    reference: str
    replayed: bool = False


def _purchase_reason(names):
    from drivers.services.points import MAX_POINT_REASON_LENGTH

    reason = 'Reward purchase: ' + ', '.join(names)
    if len(reason) > MAX_POINT_REASON_LENGTH:
        reason = reason[: MAX_POINT_REASON_LENGTH - 1] + '…'
    return reason


@transaction.atomic
def checkout_cart(*, user, idempotency_key=None):
    """Buy everything in the driver's cart: spend the points and empty the cart.

    This is an internal points redemption, not external provider fulfillment.
    """
    # Imported here: drivers.services imports this module to clear carts.
    from drivers.services.points import PointAdjustmentError, spend_driver_points

    scope = driver_catalog_scope(user)
    # Serialize checkouts for one Driver before reading their cart. Otherwise
    # concurrent requests can both read the same items and spend twice.
    driver = Driver.objects.select_for_update().get(pk=scope.driver_id)
    if idempotency_key is not None:
        existing = Redemption.objects.filter(driver=driver, idempotency_key=idempotency_key).first()
        if existing:
            return Purchase(
                items=list(existing.items.order_by('pk').values_list('product_name', flat=True)),
                points_spent=existing.total_points,
                point_balance=existing.balance_after,
                redemption_id=existing.pk,
                reference=existing.sale.reference,
                replayed=True,
            )
    items = list(_cart_items(scope).select_for_update(of=('self',)))
    if not items:
        raise ValidationError({'detail': 'Your cart is empty.'}, code='cart_empty')
    if any(not item.product.is_available for item in items):
        raise ValidationError(
            {'detail': 'Remove unavailable rewards from your cart before checking out.'},
            code='cart_has_unavailable',
        )

    sponsor = SponsorCompany.objects.get(pk=scope.company_id)
    costs = [point_cost(item.product.price_usd, sponsor.points_per_dollar) for item in items]
    total = sum(costs)
    names = [item.product.name for item in items]
    if total > 0:
        try:
            balance = spend_driver_points(
                driver=driver, point_cost=total, reason=_purchase_reason(names)
            ).balance
        except PointAdjustmentError as error:
            raise ValidationError({'detail': error.message}, code=error.code) from error
    else:
        # The ledger rejects zero-point entries, so free rewards leave no row.
        balance = driver.point_balance

    completed_at = timezone.now()
    sale = CompletedSale.objects.create(
        sponsor=sponsor,
        driver=driver,
        reference=f'REDEMPTION-{uuid4().hex}',
        gross_amount_usd=sum((item.product.price_usd for item in items), Decimal('0.00')),
        completed_at=completed_at,
    )
    redemption = Redemption.objects.create(
        driver=driver, sponsor=sponsor, sale=sale,
        total_points=total, balance_after=balance, idempotency_key=idempotency_key,
        completed_at=completed_at,
    )
    RedemptionItem.objects.bulk_create([
        RedemptionItem(
            redemption=redemption, product=item.product,
            product_name=item.product.name, unit_price_usd=item.product.price_usd,
            unit_points=cost, quantity=1,
        ) for item, cost in zip(items, costs)
    ])
    CartItem.objects.filter(pk__in=[item.pk for item in items]).delete()
    transaction.on_commit(
        lambda: notify_reward_purchase(driver, total, len(items), balance), robust=True
    )
    return Purchase(
        items=names, points_spent=total, point_balance=balance,
        redemption_id=redemption.pk, reference=sale.reference,
    )
