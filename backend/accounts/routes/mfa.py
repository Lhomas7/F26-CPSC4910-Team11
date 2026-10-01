from django.urls import path

from ..views import (
    MFABackupCodesRegenerateView,
    MFADisableView,
    MFARequestCodeView,
    MFAResetView,
    MFASetupView,
    MFAStatusView,
    MFAVerifyView,
    SponsorMFASettingsView,
)

urlpatterns = [
    path('mfa/status/', MFAStatusView.as_view(), name='mfa-status'),
    path('mfa/setup/', MFASetupView.as_view(), name='mfa-setup'),
    path('mfa/verify/', MFAVerifyView.as_view(), name='mfa-verify'),
    path('mfa/request-code/', MFARequestCodeView.as_view(), name='mfa-request-code'),
    path('mfa/reset/', MFAResetView.as_view(), name='mfa-reset'),
    path('mfa/disable/', MFADisableView.as_view(), name='mfa-disable'),
    path(
        'mfa/backup-codes/regenerate/',
        MFABackupCodesRegenerateView.as_view(),
        name='mfa-backup-codes-regenerate',
    ),
    path(
        'sponsor/mfa/settings/',
        SponsorMFASettingsView.as_view(),
        name='sponsor-mfa-settings',
    ),
]
