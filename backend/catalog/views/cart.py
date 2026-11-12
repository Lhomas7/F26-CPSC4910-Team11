from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import DriverAccount, MFAEnrolled
from catalog.serializers import CartAddSerializer, CartItemSerializer
from catalog.serializers.cart import CartCheckoutSerializer
from catalog.services import add_to_cart, checkout_cart, empty_cart, get_cart, remove_from_cart
from catalog.services.cart import (
    CheckoutCancelled,
    ReviewChanged,
    cancel_unfinished_checkout,
    purchase_receipt,
    review_cart,
)
from catalog.models import Redemption
from django.shortcuts import get_object_or_404


def _cart_response(user, status_code=status.HTTP_200_OK, *, cart=None):
    cart = cart if cart is not None else get_cart(user=user)
    rate = cart.sponsor.points_per_dollar
    items = list(cart.items)
    return Response(
        {
            'results': CartItemSerializer(
                items,
                many=True,
                context={'points_per_dollar': rate, 'point_balance': cart.point_balance},
            ).data,
            'item_count': len(items),
            'total_points': cart.total_points,
            'point_balance': cart.point_balance,
            'sponsor': {'id': cart.sponsor.pk, 'name': cart.sponsor.name},
            'pricing': {'status': 'configured', 'points_per_dollar': rate},
        },
        status=status_code,
    )


class DriverCartView(APIView):
    permission_classes = [IsAuthenticated, DriverAccount, MFAEnrolled]

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if isinstance(exc, PermissionDenied):
            # Match the catalog: pending/unassigned drivers get a machine code.
            response.data['code'] = exc.get_codes()
        elif isinstance(exc, ValidationError):
            codes = exc.get_codes()
            response.data['code'] = codes.get('detail', 'invalid_request') if isinstance(codes, dict) else 'invalid_request'
        elif isinstance(exc, NotFound):
            response.data['code'] = 'not_found'
        elif isinstance(exc, CheckoutCancelled):
            response.data['code'] = exc.default_code
        return response

    def check_not_viewing_as(self, request):
        if getattr(request, 'impersonation_active', False):
            raise PermissionDenied('Stop viewing as this user before changing their cart.')


@method_decorator(never_cache, name='dispatch')
class CartView(DriverCartView):
    def get(self, request):
        return _cart_response(request.user)

    def delete(self, request):
        self.check_not_viewing_as(request)
        empty_cart(user=request.user)
        return _cart_response(request.user)


@method_decorator(never_cache, name='dispatch')
class CartItemsView(DriverCartView):
    def post(self, request):
        self.check_not_viewing_as(request)
        serializer = CartAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, created = add_to_cart(
            user=request.user, product_id=serializer.validated_data['product_id']
        )
        # Return the whole cart so the client can refresh its count and totals at once.
        return _cart_response(
            request.user, status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


@method_decorator(never_cache, name='dispatch')
class CartItemView(DriverCartView):
    def delete(self, request, product_id):
        self.check_not_viewing_as(request)
        remove_from_cart(user=request.user, product_id=product_id)
        return _cart_response(request.user)


@method_decorator(never_cache, name='dispatch')
class CartCheckoutView(DriverCartView):
    def post(self, request):
        self.check_not_viewing_as(request)
        serializer = CartCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase = checkout_cart(
                user=request.user,
                idempotency_key=serializer.validated_data.get('idempotency_key'),
                review_token=serializer.validated_data.get('review_token'),
            )
        except ReviewChanged:
            cart, token = review_cart(user=request.user)
            review = _cart_response(request.user, cart=cart).data
            review['review_token'] = token
            return Response({'detail': str(ReviewChanged.default_detail),
                             'code': 'review_changed', 'review': review}, status=409)
        response = _cart_response(request.user)
        response.data['purchase'] = _receipt_data(purchase)
        return response


def _receipt_data(purchase):
    return {
        'items': purchase.items,
        'points_spent': purchase.points_spent,
        'point_balance': purchase.point_balance,
        'redemption_id': purchase.redemption_id,
        'reference': purchase.reference,
        'replayed': purchase.replayed,
        'line_items': purchase.line_items,
        'completed_at': purchase.completed_at,
    }


@method_decorator(never_cache, name='dispatch')
class CartReviewView(DriverCartView):
    def post(self, request):
        self.check_not_viewing_as(request)
        if request.data:
            raise ValidationError({'detail': 'Review accepts an empty body.'}, code='invalid_request')
        cart, token = review_cart(user=request.user)
        response = _cart_response(request.user, cart=cart)
        response.data['review_token'] = token
        return response


@method_decorator(never_cache, name='dispatch')
class RedemptionLookupView(DriverCartView):
    def get(self, request, key):
        # Resolve the owning Driver's historical attempt even after a sponsor
        # change. Current catalog membership is not a grant to another receipt.
        if not request.user.is_active:
            raise PermissionDenied('An active account is required.')
        redemption = get_object_or_404(
            Redemption.objects.select_related('sale'),
            driver__user=request.user, idempotency_key=key,
        )
        return Response({'purchase': _receipt_data(purchase_receipt(redemption))})


@method_decorator(never_cache, name='dispatch')
class CheckoutCancellationView(DriverCartView):
    def post(self, request, key):
        self.check_not_viewing_as(request)
        if not request.user.is_active:
            raise PermissionDenied('An active account is required.')
        if request.data:
            raise ValidationError({'detail': 'Cancellation accepts an empty body.'})
        purchase = cancel_unfinished_checkout(user=request.user, key=key)
        if purchase:
            return Response({'status': 'completed', 'purchase': _receipt_data(purchase)})
        return Response({'status': 'cancelled'})
