from rest_framework.exceptions import NotFound
from rest_framework.generics import RetrieveAPIView

from .models import AboutPageRelease
from .serializers import AboutPageReleaseSerializer


class CurrentAboutPageReleaseView(RetrieveAPIView):
    """Return the release with the newest release date."""

    authentication_classes = ()
    permission_classes = ()
    serializer_class = AboutPageReleaseSerializer

    def get_object(self):
        release = AboutPageRelease.objects.first()
        if release is None:
            raise NotFound('No About page release information is available.')
        return release
