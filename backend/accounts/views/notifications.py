from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import DriverNotificationPreferences, Notification
from ..permissions import DriverAccount, DriverOrSponsor, MFAEnrolled
from ..serializers import (
    MarkNotificationsReadSerializer,
    NotificationPreferencesSerializer,
    NotificationSerializer,
)

NOTIFICATION_CENTER_LIMIT = 50


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


def notification_center(user, limit=NOTIFICATION_CENTER_LIMIT):
    notifications = Notification.objects.filter(user=user)
    return {
        'results': NotificationSerializer(notifications[:limit], many=True).data,
        'unread_count': notifications.filter(read=False).count(),
    }


class NotificationListView(APIView):
    """The signed-in user's most recent in-app alerts, newest first."""

    permission_classes = [IsAuthenticated, DriverOrSponsor, MFAEnrolled]

    def get(self, request):
        try:
            limit = int(request.query_params.get('limit', NOTIFICATION_CENTER_LIMIT))
        except ValueError:
            limit = NOTIFICATION_CENTER_LIMIT
        limit = min(max(limit, 1), NOTIFICATION_CENTER_LIMIT)
        return Response(notification_center(request.user, limit))


class NotificationReadView(APIView):
    """Mark some, or all, of the signed-in user's alerts as read."""

    permission_classes = [IsAuthenticated, DriverOrSponsor, MFAEnrolled]

    def post(self, request):
        serializer = MarkNotificationsReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        unread = Notification.objects.filter(user=request.user, read=False)
        ids = serializer.validated_data.get('ids')
        if ids is not None:
            unread = unread.filter(pk__in=ids)
        unread.update(read=True)
        return Response(notification_center(request.user))


class NotificationClearAllView(APIView):
    """Delete every alert in the signed-in user's notification center."""

    permission_classes = [IsAuthenticated, DriverOrSponsor, MFAEnrolled]

    def post(self, request):
        Notification.objects.filter(user=request.user).delete()
        return Response(notification_center(request.user))


class NotificationDetailView(APIView):
    """Delete one of the signed-in user's alerts."""

    permission_classes = [IsAuthenticated, DriverOrSponsor, MFAEnrolled]

    def delete(self, request, notification_id):
        get_object_or_404(Notification, pk=notification_id, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
