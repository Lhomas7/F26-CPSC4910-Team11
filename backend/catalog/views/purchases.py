from django.db.models import Prefetch
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import DriverAccount, MFAEnrolled
from catalog.models import Redemption, RedemptionItem
from catalog.serializers.purchases import PurchaseHistorySerializer


class PurchaseHistoryPagination(PageNumberPagination):
    page_size = 25


@method_decorator(never_cache, name='dispatch')
class DriverPurchaseView(GenericAPIView):
    permission_classes = [IsAuthenticated, DriverAccount, MFAEnrolled]
    serializer_class = PurchaseHistorySerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_active:
            raise PermissionDenied('An active account is required.')
        # A driver's completed purchases remain theirs after a sponsor transfer.
        return (
            Redemption.objects.filter(driver__user=user)
            .select_related('sale')
            .prefetch_related(Prefetch('items', queryset=RedemptionItem.objects.order_by('pk')))
            .order_by('-completed_at', '-pk')
        )


class DriverPurchaseHistoryView(ListModelMixin, DriverPurchaseView):
    pagination_class = PurchaseHistoryPagination

    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)


class DriverPurchaseDetailView(RetrieveModelMixin, DriverPurchaseView):
    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)
