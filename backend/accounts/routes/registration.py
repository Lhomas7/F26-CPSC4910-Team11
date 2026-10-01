from django.urls import path

from ..views import DriverRegistrationView, SponsorRegistrationView

urlpatterns = [
    path('accounts/driver/', DriverRegistrationView.as_view(), name='driver-register'),
    path('accounts/sponsor/', SponsorRegistrationView.as_view(), name='sponsor-register'),
]
