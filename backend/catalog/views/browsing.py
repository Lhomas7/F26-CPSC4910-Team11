from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import MFAEnrolled
from catalog.serializers import CatalogBrowseProductSerializer
from catalog.services import browse_catalog


class CatalogPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


@method_decorator(never_cache, name='dispatch')
class CatalogBrowseView(APIView):
    permission_classes = [IsAuthenticated, MFAEnrolled]

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if isinstance(exc, PermissionDenied):
            # Clients can distinguish pending/unassigned guidance from outages
            # without parsing English messages or treating a denial as empty.
            response.data['code'] = exc.get_codes()
        return response

    def get(self, request):
        listing = browse_catalog(user=request.user)
        # Ownership filters are intentionally not part of this contract.
        unknown = request.query_params.keys() - {'page', 'page_size'}
        if unknown:
            raise ValidationError({key: 'This query parameter is not supported.' for key in sorted(unknown)})
        paginator = CatalogPagination()
        page = paginator.paginate_queryset(listing.products, request, view=self)
        rate = listing.sponsor.points_per_dollar
        response = paginator.get_paginated_response(CatalogBrowseProductSerializer(
            page, many=True, context={
                'points_per_dollar': rate, 'point_balance': listing.point_balance,
            },
        ).data)
        response.data.update({
            'sponsor': {'id': listing.sponsor.pk, 'name': listing.sponsor.name},
            'point_balance': listing.point_balance,
            'pricing': {'status': 'configured', 'points_per_dollar': rate},
        })
        return response
