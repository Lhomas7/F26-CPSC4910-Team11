from django.urls import path

from ..views.sponsor_organization import (
    SponsorOrganizationView,
    SponsorTeamListView,
    SponsorTeamMemberView,
)

urlpatterns = [
    path('sponsor/organization/', SponsorOrganizationView.as_view(), name='sponsor-organization'),
    path('sponsor/team/', SponsorTeamListView.as_view(), name='sponsor-team'),
    path(
        'sponsor/team/<int:user_id>/',
        SponsorTeamMemberView.as_view(),
        name='sponsor-team-member',
    ),
]
