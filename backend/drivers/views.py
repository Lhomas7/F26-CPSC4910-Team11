from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Driver
from .serializers import DriverSerializer


class DriverViewSet(viewsets.ModelViewSet):
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'sponsor_account') and user.sponsor_account is not None:
            return Driver.objects.filter(sponsor=user.sponsor_account.company)
        if hasattr(user, 'driver_profile') and user.driver_profile is not None:
            return Driver.objects.filter(user=user)
        return Driver.objects.none()