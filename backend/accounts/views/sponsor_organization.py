import logging

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import DriverOrSponsor, MFAEnrolled, SponsorAccount
from ..serializers import (
    SponsorOrganizationSerializer,
    SponsorTeamMemberSerializer,
    SponsorTeamMemberStatusSerializer,
)
from ..services import get_account_type
from ..services.reauth import current_password_error

logger = logging.getLogger(__name__)


def refuse_while_viewing_as(request, action):
    """An administrator viewing as a sponsor must not change that sponsor's data."""
    if getattr(request, 'impersonation_active', False):
        raise PermissionDenied(f'Stop viewing as this user before {action}.')


@method_decorator(never_cache, name='dispatch')
class SponsorOrganizationView(APIView):
    """The details of a sponsor organization, as shown to its drivers.

    A sponsor reads and edits their own organization. A driver can read the
    organization they are linked to, so they know more about their sponsor.
    """

    permission_classes = [IsAuthenticated, DriverOrSponsor, MFAEnrolled]

    def get_permissions(self):
        if self.request.method not in SAFE_METHODS:
            return [IsAuthenticated(), SponsorAccount(), MFAEnrolled()]
        return super().get_permissions()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method not in SAFE_METHODS:
            refuse_while_viewing_as(request, 'changing organization details')

    def get_company(self):
        user = self.request.user
        if get_account_type(user) == 'sponsor':
            return user.sponsor_account.company
        company = user.driver_profile.sponsor
        if company is None:
            raise NotFound('You are not linked to a sponsor organization yet.')
        return company

    def get(self, request):
        return Response(SponsorOrganizationSerializer(self.get_company()).data)

    def patch(self, request):
        serializer = SponsorOrganizationSerializer(
            self.get_company(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SponsorTeamMixin:
    """Sponsor users manage the other sponsor users in their own company only."""

    permission_classes = [IsAuthenticated, SponsorAccount, MFAEnrolled]

    def team_queryset(self, request):
        company = request.user.sponsor_account.company
        # Staff accounts are administrators, even if they also hold a sponsor
        # record, so they are never part of a company's team.
        return (
            get_user_model()
            .objects.filter(
                sponsor_account__company=company,
                is_staff=False,
                is_superuser=False,
            )
            .select_related('sponsor_account')
        )


@method_decorator(never_cache, name='dispatch')
class SponsorTeamListView(SponsorTeamMixin, APIView):
    def get(self, request):
        members = sorted(
            self.team_queryset(request),
            key=lambda user: (
                not user.is_active,
                (user.get_full_name() or user.get_username()).casefold(),
            ),
        )
        return Response(
            SponsorTeamMemberSerializer(members, many=True, context={'request': request}).data
        )


@method_decorator(never_cache, name='dispatch')
class SponsorTeamMemberView(SponsorTeamMixin, APIView):
    http_method_names = ['patch', 'options']

    def patch(self, request, user_id):
        refuse_while_viewing_as(request, "changing a teammate's account")
        serializer = SponsorTeamMemberStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_active = serializer.validated_data['is_active']

        # Another company's sponsor, an administrator, and an unknown id all
        # look the same, so this cannot be used to explore other organizations.
        member = get_object_or_404(self.team_queryset(request), pk=user_id)
        if member.pk == request.user.pk:
            return Response(
                {
                    'code': 'cannot_change_self',
                    'detail': "You can't turn off your own account. Ask another sponsor at "
                    'your company to do it.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if member.is_active != is_active:
            # Turning an account off or back on changes who can sign in, so the
            # sponsor confirms it is really them (counts toward the sign-in lockout).
            error = current_password_error(
                request.user, serializer.validated_data.get('current_password')
            )
            if error:
                return error
            member.is_active = is_active
            member.save(update_fields=['is_active'])
            logger.info(
                'Sponsor user %s %s sponsor user %s.',
                request.user.pk,
                'reactivated' if is_active else 'deactivated',
                member.pk,
            )

        return Response(SponsorTeamMemberSerializer(member, context={'request': request}).data)
