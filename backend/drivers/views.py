from django.db.models import IntegerField, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import MFAEnrolled
from accounts.services import get_account_type

from .models import Driver, PointTransaction
from .serializers import (
    DriverRemovalRequestSerializer,
    DriverSerializer,
    DriverStatusChangeSerializer,
    PointAdjustmentRequestSerializer,
    PointHistorySerializer,
    PointTransactionSerializer,
)
from .services import (
    DriverMembershipError,
    PointAdjustmentError,
    adjust_driver_points,
    link_driver_to_sponsor,
    remove_driver_from_sponsor,
)

MAX_POINT_HISTORY_LIMIT = 200


class DriverViewSet(viewsets.ReadOnlyModelViewSet):
    """Read driver records and expose narrowly scoped sponsor actions.

    Driver creation, arbitrary updates, and deletion deliberately are not
    router actions. Membership and point changes must use the audited domain
    actions below instead.
    """
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated, MFAEnrolled]

    def get_queryset(self):
        # Sponsors manage their own company's drivers and drivers see their own
        # record. Admins manage driver accounts through the admin user
        # endpoints instead, so they get nothing here.
        user = self.request.user
        if hasattr(user, 'sponsor_account') and user.sponsor_account is not None:
            queryset = Driver.objects.filter(sponsor=user.sponsor_account.company)
        elif hasattr(user, 'driver_profile') and user.driver_profile is not None:
            queryset = Driver.objects.filter(user=user)
        else:
            return Driver.objects.none()
        return queryset.select_related('user', 'sponsor').annotate(
            calculated_point_balance=Coalesce(
                Sum('point_transactions__point_change'),
                Value(0),
                output_field=IntegerField(),
            )
        )

    @action(detail=True, methods=['post'], url_path='points')
    def points(self, request, pk=None):
        if not hasattr(request.user, 'sponsor_account'):
            return Response(
                {'detail': 'Only sponsor accounts can adjust driver points.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        request_serializer = PointAdjustmentRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        driver = self.get_object()
        try:
            result = adjust_driver_points(
                driver=driver,
                changed_by_user=request.user,
                point_change=request_serializer.validated_data['point_change'],
                reason=request_serializer.validated_data.get('reason'),
            )
        except PointAdjustmentError as error:
            response_status = (
                status.HTTP_403_FORBIDDEN
                if error.code in {'not_sponsor', 'driver_outside_company'}
                else status.HTTP_404_NOT_FOUND
                if error.code == 'driver_not_found'
                else status.HTTP_400_BAD_REQUEST
            )
            return Response(
                {error.field: [error.message]},
                status=response_status,
            )

        return Response({
            'transaction': PointTransactionSerializer(result.transaction).data,
            'balance': result.balance,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a pending driver belonging to the sponsor's company."""
        if not hasattr(request.user, 'sponsor_account'):
            return Response(
                {'detail': 'Only sponsor accounts can approve drivers.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        driver = self.get_object()
        if driver.status != 'approved':
            driver.status = 'approved'
            driver.save(update_fields=['status'])
        return Response(self.get_serializer(driver).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='remove')
    def remove(self, request, pk=None):
        """Reject a pending driver or drop an approved one; a reason is required."""
        if not hasattr(request.user, 'sponsor_account'):
            return Response(
                {'detail': 'Only sponsor accounts can reject or drop drivers.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        request_serializer = DriverRemovalRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        driver = self.get_object()
        try:
            record = remove_driver_from_sponsor(
                driver=driver,
                changed_by_user=request.user,
                reason=request_serializer.validated_data.get('reason'),
            )
        except DriverMembershipError as error:
            response_status = (
                status.HTTP_403_FORBIDDEN
                if error.code in {'not_sponsor', 'driver_outside_company'}
                else status.HTTP_404_NOT_FOUND
                if error.code == 'driver_not_found'
                else status.HTTP_400_BAD_REQUEST
            )
            return Response({error.field: [error.message]}, status=response_status)

        return Response(DriverStatusChangeSerializer(record).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def link(self, request):
        try:
            driver = link_driver_to_sponsor(
                username=request.data.get('username'),
                changed_by_user=request.user,
            )
        except DriverMembershipError as error:
            response_status = (
                status.HTTP_403_FORBIDDEN
                if error.code == 'not_sponsor'
                else status.HTTP_404_NOT_FOUND
                if error.code == 'driver_not_found'
                else status.HTTP_400_BAD_REQUEST
            )
            return Response({error.field: error.message}, status=response_status)

        return Response(self.get_serializer(driver).data)


class PointHistoryView(generics.ListAPIView):
    """Point changes, newest first, scoped to who is asking.

    Drivers see their own history; sponsors see changes their organization
    made, optionally for one driver (?driver=<id>). Admins don't manage points,
    so they're refused. ?limit=<n> returns only the most recent n changes.
    """

    serializer_class = PointHistorySerializer
    permission_classes = [IsAuthenticated, MFAEnrolled]

    def get_queryset(self):
        user = self.request.user
        account_type = get_account_type(user)
        queryset = PointTransaction.objects.select_related('driver', 'sponsor', 'changed_by_user')
        if account_type == 'sponsor':
            queryset = queryset.filter(sponsor=user.sponsor_account.company)
            driver_id = self.request.query_params.get('driver')
            if driver_id:
                if not driver_id.isdigit():
                    return queryset.none()
                queryset = queryset.filter(driver_id=int(driver_id))
        elif account_type == 'driver':
            queryset = queryset.filter(driver__user=user)
        else:
            raise PermissionDenied('Only drivers and sponsors have point history.')

        limit = self.request.query_params.get('limit')
        if limit and limit.isdigit():
            queryset = queryset[:min(int(limit), MAX_POINT_HISTORY_LIMIT)]
        return queryset
