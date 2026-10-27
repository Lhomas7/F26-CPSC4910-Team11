from django.urls import path

from ..views.notifications import (
    NotificationListView,
    NotificationPreferencesView,
    NotificationReadView,
)

urlpatterns = [
    path('notifications/', NotificationListView.as_view(), name='notifications'),
    path('notifications/read/', NotificationReadView.as_view(), name='notifications-read'),
    path(
        'notifications/preferences/',
        NotificationPreferencesView.as_view(),
        name='notification-preferences',
    ),
]
