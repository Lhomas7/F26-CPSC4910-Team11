from rest_framework import permissions, viewsets
from .models import Driver
from .serializers import DriverSerializer


class DriverViewSet(viewsets.ModelViewSet):
    serializer_class = DriverSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Driver.objects.filter(sponsor_id=self.request.user.id)
