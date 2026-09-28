from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import MFAEnrolled

from .models import Driver
from .serializers import DriverSerializer


class DriverViewSet(viewsets.ModelViewSet):
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated, MFAEnrolled]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'sponsor_account') and user.sponsor_account is not None:
            return Driver.objects.filter(sponsor=user.sponsor_account.company)
        if hasattr(user, 'driver_profile') and user.driver_profile is not None:
            return Driver.objects.filter(user=user)
        return Driver.objects.none()

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