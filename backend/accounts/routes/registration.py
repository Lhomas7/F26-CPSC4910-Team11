from django.urls import path

from ..views.registration import (
    DriverRegistrationView,
    PublicSponsorListView,
    SponsorRegistrationView,
)

urlpatterns = [
    path('accounts/driver/', DriverRegistrationView.as_view(), name='driver-register'),
    path('sponsors/', PublicSponsorListView.as_view(), name='public-sponsors'),
    path('accounts/sponsor/', SponsorRegistrationView.as_view(), name='sponsor-register'),
]
