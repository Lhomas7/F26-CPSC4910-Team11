from django.urls import path

from ..views.notifications import (
    NotificationClearAllView,
    NotificationDetailView,
    NotificationListView,
    NotificationPreferencesView,
    NotificationReadView,
    SponsorNotificationPreferencesView,
)

urlpatterns = [
    path('notifications/', NotificationListView.as_view(), name='notifications'),
    path('notifications/read/', NotificationReadView.as_view(), name='notifications-read'),
    path('notifications/clear/', NotificationClearAllView.as_view(), name='notifications-clear'),
    path(
        'notifications/<int:notification_id>/',
        NotificationDetailView.as_view(),
        name='notification-detail',
    ),
    path(
        'notifications/preferences/',
        NotificationPreferencesView.as_view(),
        name='notification-preferences',
    ),
    path(
        'notifications/sponsor-preferences/',
        SponsorNotificationPreferencesView.as_view(),
        name='sponsor-notification-preferences',
    ),
]
