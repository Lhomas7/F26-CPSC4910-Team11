from django.urls import path

from ..views.notifications import NotificationPreferencesView

urlpatterns = [
    path(
        'notifications/preferences/',
        NotificationPreferencesView.as_view(),
        name='notification-preferences',
    ),
]
