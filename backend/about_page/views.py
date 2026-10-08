from rest_framework.exceptions import NotFound
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from accounts.permissions import AdminAccount, MFAEnrolled

from .models import AboutPageRelease
from .serializers import AboutPageReleaseSerializer


class CurrentAboutPageReleaseView(RetrieveUpdateAPIView):
    """Return the release with the newest release date; admins can edit it."""

    serializer_class = AboutPageReleaseSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return []
        return [IsAuthenticated(), AdminAccount(), MFAEnrolled()]

    def get_object(self):
        release = AboutPageRelease.objects.first()
        if release is None:
            raise NotFound('No About page release information is available.')
        return release
