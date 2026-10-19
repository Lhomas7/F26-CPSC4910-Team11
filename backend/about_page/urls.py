from django.urls import path

from .views import CurrentAboutPageReleaseView

app_name = 'about_page'

urlpatterns = [
    path('about/', CurrentAboutPageReleaseView.as_view(), name='current-release'),
]
