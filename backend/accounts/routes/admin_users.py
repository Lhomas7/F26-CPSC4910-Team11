from django.urls import path

from ..views import (
    AdminAccountDetailView,
    AdminDriverDetailView,
    AdminImpersonationStartView,
    AdminImpersonationStopView,
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
    path('admin/users/', AdminUserListView.as_view(), name='admin-user-list'),
    path(
        'admin/admins/<int:user_id>/',
        AdminAccountDetailView.as_view(),
        name='admin-account-detail',
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
]
