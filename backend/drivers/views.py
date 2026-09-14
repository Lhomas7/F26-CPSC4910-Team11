from rest_framework import viewsets
from .models import Driver
from .serializers import DriverSerializer

class DriverViewSet(viewsets.ModelViewSet):
    serializer_class = DriverSerializer

    def get_queryset(self):
        sponsor_id = 1  # placeholder, self.request.user.id
        return Driver.objects.filter(sponsor_id=sponsor_id)