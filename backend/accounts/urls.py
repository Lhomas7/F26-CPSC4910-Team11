from django.urls import path

from .views import (
    CSRFView,
    ChangePasswordView,
    DriverRegistrationView,
    LoginView,
    LogoutView,
    MeView,
    SponsorRegistrationView,
)

app_name = 'accounts'

urlpatterns = [
    path('accounts/driver/', DriverRegistrationView.as_view(), name='driver-register'),
    path('accounts/sponsor/', SponsorRegistrationView.as_view(), name='sponsor-register'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('csrf/', CSRFView.as_view(), name='csrf'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
]