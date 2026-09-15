from rest_framework import generics, viewsets
from .models import AboutInformation, Driver
from .serializers import AboutInformationSerializer, DriverSerializer

class DriverViewSet(viewsets.ModelViewSet):
    serializer_class = DriverSerializer

    def get_queryset(self):
        sponsor_id = 1  # placeholder, self.request.user.id
        return Driver.objects.filter(sponsor_id=sponsor_id)


class AboutInformationView(generics.RetrieveAPIView):
    """Return the current About-page content from the data store."""

    serializer_class = AboutInformationSerializer

    def get_object(self):
        return AboutInformation.objects.latest('updated_at', 'pk')
