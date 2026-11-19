from django.urls import path

from ..views.admin_password_reset import AdminPasswordResetRequestView
from ..views.admin_users import (
    AdminAccountDetailView,
    AdminDriverDetailView,
    AdminDriverSponsorAssignView,
    AdminDriverSponsorRemoveView,
    AdminImpersonationStartView,
    AdminImpersonationStopView,
    AdminRegistrationSettingsView,
    AdminSponsorCompanyListView,
    AdminSponsorDetailView,
    AdminUserListView,
)

urlpatterns = [
    path(
        'admin/impersonation/<int:user_id>/',
        AdminImpersonationStartView.as_view(),
        name='admin-impersonation-start',
    ),
    path(
        'admin/impersonation/stop/',
        AdminImpersonationStopView.as_view(),
        name='admin-impersonation-stop',
    ),
    path(
        'admin/sponsor-organizations/',
        AdminSponsorCompanyListView.as_view(),
        name='admin-sponsor-company-list',
    ),
    path(
        'admin/registration-settings/',
        AdminRegistrationSettingsView.as_view(),
        name='admin-registration-settings',
    ),
    path('admin/users/', AdminUserListView.as_view(), name='admin-user-list'),
    path(
        'admin/admins/<int:user_id>/',
        AdminAccountDetailView.as_view(),
        name='admin-account-detail',
    ),
    path(
        'admin/admins/<int:user_id>/password-reset/',
        AdminPasswordResetRequestView.as_view(),
        name='admin-password-reset-request',
    ),
    path(
        'admin/sponsors/<int:user_id>/',
        AdminSponsorDetailView.as_view(),
        name='admin-sponsor-detail',
    ),
    path(
        'admin/drivers/<int:user_id>/',
        AdminDriverDetailView.as_view(),
        name='admin-driver-detail',
    ),
    path(
        'admin/drivers/<int:user_id>/sponsors/',
        AdminDriverSponsorAssignView.as_view(),
        name='admin-driver-sponsor-assign',
    ),
    path(
        'admin/drivers/<int:user_id>/sponsors/<int:sponsor_id>/remove/',
        AdminDriverSponsorRemoveView.as_view(),
        name='admin-driver-sponsor-remove',
    ),
]
