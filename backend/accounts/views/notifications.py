from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import DriverNotificationPreferences
from ..permissions import DriverAccount, MFAEnrolled
from ..serializers import NotificationPreferencesSerializer


class NotificationPreferencesView(APIView):
    """The signed-in driver's point alert settings, saved to their profile."""

    permission_classes = [IsAuthenticated, DriverAccount, MFAEnrolled]

    def get(self, request):
        preferences = DriverNotificationPreferences.for_driver(request.user.driver_profile)
        return Response(NotificationPreferencesSerializer(preferences).data)

    def patch(self, request):
        preferences = DriverNotificationPreferences.for_driver(request.user.driver_profile)
        serializer = NotificationPreferencesSerializer(preferences, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
