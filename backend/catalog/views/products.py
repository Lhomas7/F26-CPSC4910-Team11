from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import MFAEnrolled, SponsorAccount
from catalog.serializers import CatalogProductSerializer
from catalog.services import create_catalog_product, update_product_availability


@method_decorator(never_cache, name='dispatch')
class SponsorProductCreateView(APIView):
    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def post(self, request):
        product = create_catalog_product(user=request.user, data=request.data)
        return Response(CatalogProductSerializer(product).data, status=status.HTTP_201_CREATED)


@method_decorator(never_cache, name='dispatch')
class SponsorProductAvailabilityView(APIView):
    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def patch(self, request, product_id):
        product = update_product_availability(
            user=request.user,
            product_id=product_id,
            data=request.data,
        )
        return Response(CatalogProductSerializer(product).data)
