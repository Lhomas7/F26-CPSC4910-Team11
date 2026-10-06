from django.db.models import IntegerField, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import MFAEnrolled
from accounts.services import get_account_type

from .models import Driver
from .serializers import (
    DriverSerializer,
    PointAdjustmentRequestSerializer,
    PointTransactionSerializer,
)
from .services import PointAdjustmentError, adjust_driver_points


class DriverViewSet(viewsets.ModelViewSet):
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated, MFAEnrolled]

    def get_queryset(self):
        user = self.request.user
        if get_account_type(user) == 'admin':
            # Admins get a read-only overview of every driver across all
            # sponsors; account changes go through the admin user endpoints.
            if self.request.method not in SAFE_METHODS:
                return Driver.objects.none()
            queryset = Driver.objects.select_related('sponsor').order_by('name')
        elif hasattr(user, 'sponsor_account') and user.sponsor_account is not None:
            queryset = Driver.objects.filter(sponsor=user.sponsor_account.company)
        elif hasattr(user, 'driver_profile') and user.driver_profile is not None:
            queryset = Driver.objects.filter(user=user)
        else:
            return Driver.objects.none()
        return queryset.annotate(
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

    @action(detail=False, methods=['post'])
    def link(self, request):
        user = request.user
        if not hasattr(user, 'sponsor_account') or user.sponsor_account is None:
            return Response(
                {'detail': 'Only a sponsor can link a driver.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        username = (request.data.get('username') or '').strip()
        if not username:
            return Response(
                {'detail': 'Username is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            driver = Driver.objects.get(user__username=username)
        except Driver.DoesNotExist:
            return Response(
                {'detail': f'No driver found with username "{username}".'},
                status=status.HTTP_404_NOT_FOUND,
            )

        company = user.sponsor_account.company
        if driver.sponsor is not None and driver.sponsor != company:
            return Response(
                {'detail': 'That driver is already assigned to another sponsor.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        driver.sponsor = company
        driver.save()
        return Response(self.get_serializer(driver).data)
