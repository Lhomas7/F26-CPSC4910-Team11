from django.urls import path

from ..views.authentication import (
    CSRFView,
    ChangePasswordView,
    LoginMFARequestCodeView,
    LoginMFAView,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('login/mfa/', LoginMFAView.as_view(), name='login-mfa'),
    path(
        'login/mfa/request-code/',
        LoginMFARequestCodeView.as_view(),
        name='login-mfa-request-code',
    ),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('csrf/', CSRFView.as_view(), name='csrf'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path(
        'password-reset/confirm/',
        PasswordResetConfirmView.as_view(),
        name='password-reset-confirm',
    ),
]
