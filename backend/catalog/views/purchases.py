from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import DriverAccount, MFAEnrolled, SponsorAccount
from catalog.models import Redemption, RedemptionItem
from catalog.serializers.purchases import PurchaseDateFilterSerializer, PurchaseHistorySerializer
from drivers.models import Driver


class PurchaseHistoryPagination(PageNumberPagination):
    page_size = 25


@method_decorator(never_cache, name='dispatch')
class PurchaseView(GenericAPIView):
    serializer_class = PurchaseHistorySerializer

    def get_queryset(self):
        if not self.request.user.is_active:
            raise PermissionDenied('An active account is required.')
        return (
            Redemption.objects.all()
            .select_related('sale')
            .prefetch_related(Prefetch('items', queryset=RedemptionItem.objects.order_by('pk')))
            .order_by('-completed_at', '-pk')
        )


class DriverPurchaseView(PurchaseView):
    permission_classes = [IsAuthenticated, DriverAccount, MFAEnrolled]

    def get_queryset(self):
        # A driver's completed purchases remain theirs after a sponsor transfer.
        return super().get_queryset().filter(driver__user=self.request.user)


class DriverPurchaseHistoryView(ListModelMixin, DriverPurchaseView):
    pagination_class = PurchaseHistoryPagination

    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)


class DriverPurchaseDetailView(RetrieveModelMixin, DriverPurchaseView):
    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)


class SponsorPurchaseView(PurchaseView):
    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def get_queryset(self):
        queryset = super().get_queryset()
        company_id = self.request.user.sponsor_account.company_id
        driver_id = self.kwargs['driver_id']
        get_object_or_404(Driver.objects.only('pk'), pk=driver_id, sponsor_id=company_id)
        # Current membership grants access only to purchases made under this company.
        return queryset.filter(
            driver_id=driver_id, driver__sponsor_id=company_id, sponsor_id=company_id
        )


class SponsorPurchaseHistoryView(ListModelMixin, SponsorPurchaseView):
    pagination_class = PurchaseHistoryPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        dates = PurchaseDateFilterSerializer(data=self.request.query_params)
        dates.is_valid(raise_exception=True)
        if 'completed_from' in dates.validated_data:
            queryset = queryset.filter(completed_at__gte=dates.validated_data['completed_from'])
        if 'completed_before' in dates.validated_data:
            queryset = queryset.filter(completed_at__lt=dates.validated_data['completed_before'])
        return queryset

    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)


class SponsorPurchaseDetailView(RetrieveModelMixin, SponsorPurchaseView):
    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)
