from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import DriverAccount, MFAEnrolled
from catalog.serializers import CartAddSerializer, CartItemSerializer
from catalog.serializers.cart import CartCheckoutSerializer
from catalog.services import add_to_cart, checkout_cart, get_cart, remove_from_cart


def _cart_response(user, status_code=status.HTTP_200_OK):
    cart = get_cart(user=user)
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
        return response

    def check_not_viewing_as(self, request):
        if getattr(request, 'impersonation_active', False):
            raise PermissionDenied('Stop viewing as this user before changing their cart.')


@method_decorator(never_cache, name='dispatch')
class CartView(DriverCartView):
    def get(self, request):
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
        purchase = checkout_cart(
            user=request.user,
            idempotency_key=serializer.validated_data.get('idempotency_key'),
        )
        response = _cart_response(request.user)
        response.data['purchase'] = {
            'items': purchase.items,
            'points_spent': purchase.points_spent,
            'point_balance': purchase.point_balance,
            'redemption_id': purchase.redemption_id,
            'reference': purchase.reference,
            'replayed': purchase.replayed,
        }
        return response
