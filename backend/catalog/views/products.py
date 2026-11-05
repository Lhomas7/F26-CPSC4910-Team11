from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import MFAEnrolled, SponsorAccount
from catalog.fake_store import get_product, search_products
from catalog.providers import ProductProviderError
from catalog.serializers import CatalogProductSerializer
from catalog.services import create_catalog_product, update_product_availability
from catalog.services.access import sponsor_catalog_scope
from catalog.services.provider_import import import_provider_product, refresh_provider_product


def _provider_response(details):
    return {**details, 'price_usd': str(details['price_usd']),
            'source': 'Fake Store API demo catalog', 'inventory_verified': False}


@method_decorator(never_cache, name='dispatch')
class SponsorProviderSearchView(APIView):
    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def get(self, request):
        sponsor_catalog_scope(request.user)
        try:
            products = search_products(request.query_params.get('q', ''))
        except ProductProviderError:
            return Response({'detail': 'Product provider is unavailable.'}, status=502)
        return Response([_provider_response(product) for product in products])


@method_decorator(never_cache, name='dispatch')
class SponsorProviderProductView(APIView):
    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def get(self, request, product_id):
        sponsor_catalog_scope(request.user)
        try:
            product = get_product(product_id)
        except ProductProviderError:
            return Response({'detail': 'Product provider is unavailable.'}, status=502)
        return Response(_provider_response(product))


@method_decorator(never_cache, name='dispatch')
class SponsorProviderImportView(APIView):
    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def post(self, request, product_id):
        if request.data:
            return Response({'detail': 'Import accepts no product fields.'}, status=400)
        try:
            product = import_provider_product(user=request.user, product_id=product_id)
        except ProductProviderError:
            return Response({'detail': 'Product provider is unavailable.'}, status=502)
        return Response(CatalogProductSerializer(product).data, status=201)


@method_decorator(never_cache, name='dispatch')
class SponsorProviderRefreshView(APIView):
    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def post(self, request, product_id):
        if request.data:
            return Response({'detail': 'Refresh accepts no product fields.'}, status=400)
        try:
            product = refresh_provider_product(user=request.user, product_id=product_id)
        except ProductProviderError:
            return Response({'detail': 'Product provider is unavailable.'}, status=502)
        return Response(CatalogProductSerializer(product).data)


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
