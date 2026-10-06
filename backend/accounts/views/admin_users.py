from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..middleware import (
    IMPERSONATION_STARTED_KEY,
    IMPERSONATION_TARGET_KEY,
    clear_impersonation,
    client_ip,
    impersonation_details,
)
from ..models import AdminImpersonationEvent, SponsorCompany
from ..permissions import MFAEnrolled
from ..serializers import (
    AdminAccountDetailSerializer,
    AdminDriverDetailSerializer,
    AdminSponsorDetailSerializer,
    AdminUserCreateSerializer,
    AdminUserListSerializer,
    SponsorCompanySerializer,
)
from ..services import get_account_type, get_public_user
from ..sensitive import hide_sensitive_data

class AdminImpersonationStartView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        if request.session.get(IMPERSONATION_TARGET_KEY):
            return Response(
                {'detail': 'Stop the current view-as session before starting another.'},
                status=status.HTTP_409_CONFLICT,
            )

        target = get_object_or_404(get_user_model(), pk=user_id)
        target_role = get_account_type(target)
        if target_role not in ('driver', 'sponsor'):
            return Response(
                {'detail': 'Administrators can only view as a driver or sponsor.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not target.is_active:
            return Response(
                {'detail': 'An inactive account cannot be viewed as.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        started_at = timezone.now()
        request.session[IMPERSONATION_TARGET_KEY] = target.id
        request.session[IMPERSONATION_STARTED_KEY] = started_at.isoformat()
        AdminImpersonationEvent.objects.create(
            admin=request.user,
            target=target,
            target_role=target_role,
            action='start',
            ip_address=client_ip(request),
        )

        public_user = get_public_user(target)
        public_user['impersonation'] = impersonation_details(
            request,
            target,
            admin=request.user,
        )
        return Response(public_user)


class AdminImpersonationStopView(APIView):
    permission_classes = ()

    def post(self, request):
        admin = getattr(request, 'real_user', request.user)
        target_id = request.session.get(IMPERSONATION_TARGET_KEY)
        if not admin.is_authenticated or not admin.is_staff or not target_id:
            return Response(
                {'detail': 'No active view-as session was found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target = get_user_model().objects.filter(pk=target_id).first()
        target_role = get_account_type(target) if target else None
        clear_impersonation(request.session)
        if target and target_role in ('driver', 'sponsor'):
            AdminImpersonationEvent.objects.create(
                admin=admin,
                target=target,
                target_role=target_role,
                action='stop',
                ip_address=client_ip(request),
            )
        return Response(get_public_user(admin))



@hide_sensitive_data
class AdminUserListView(APIView):
    permission_classes = [IsAdminUser, MFAEnrolled]

    def get(self, request):
        role = request.query_params.get('role', '').strip().lower()
        search = request.query_params.get('search', '').strip()
        if role and role not in {'driver', 'sponsor', 'admin'}:
            raise DRFValidationError({'role': 'Choose driver, sponsor, or admin.'})

        # Exclude orphan Django users that have no application role.
        users = get_user_model().objects.filter(
            Q(is_staff=True)
            | Q(driver_profile__isnull=False)
            | Q(sponsor_account__isnull=False)
        ).select_related(
            'driver_profile__sponsor',
            'sponsor_account__company',
        ).distinct()

        if role == 'admin':
            users = users.filter(is_staff=True)
        elif role == 'driver':
            users = users.filter(is_staff=False, driver_profile__isnull=False)
        elif role == 'sponsor':
            users = users.filter(is_staff=False, sponsor_account__isnull=False)

        if search:
            users = users.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(driver_profile__name__icontains=search)
            ).distinct()

        data = AdminUserListSerializer(users, many=True).data
        return Response(sorted(data, key=lambda user: user['display_name'].casefold()))

    def post(self, request):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            AdminUserListSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class AdminSponsorCompanyListView(APIView):
    permission_classes = [IsAdminUser, MFAEnrolled]

    def get(self, request):
        companies = SponsorCompany.objects.order_by('name')
        return Response(SponsorCompanySerializer(companies, many=True).data)


class AdminAccountDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get_object(self, request, user_id):
        # Self-service profile editing has its own endpoint. Keeping this route
        # other-admin-only prevents accidental self-deactivation or lockout.
        return get_object_or_404(
            get_user_model().objects.filter(is_staff=True).exclude(pk=request.user.pk),
            pk=user_id,
        )

    def get(self, request, user_id):
        return Response(AdminAccountDetailSerializer(self.get_object(request, user_id)).data)

    def patch(self, request, user_id):
        account = self.get_object(request, user_id)
        serializer = AdminAccountDetailSerializer(
            account,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AdminSponsorDetailView(APIView):
    permission_classes = [IsAdminUser, MFAEnrolled]

    def get_object(self, user_id):
        return get_object_or_404(
            get_user_model().objects.select_related('sponsor_account__company'),
            pk=user_id,
            is_staff=False,
            sponsor_account__isnull=False,
        )

    def get(self, request, user_id):
        return Response(AdminSponsorDetailSerializer(self.get_object(user_id)).data)

    def patch(self, request, user_id):
        user = self.get_object(user_id)
        serializer = AdminSponsorDetailSerializer(
            user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AdminDriverDetailView(APIView):
    permission_classes = [IsAdminUser, MFAEnrolled]

    def get_object(self, user_id):
        return get_object_or_404(
            get_user_model().objects.select_related('driver_profile__sponsor'),
            pk=user_id,
            is_staff=False,
            driver_profile__isnull=False,
        )

    def serializer(self, *args, **kwargs):
        kwargs['context'] = {'request': self.request}
        return AdminDriverDetailSerializer(*args, **kwargs)

    def get(self, request, user_id):
        return Response(self.serializer(self.get_object(user_id)).data)

    def patch(self, request, user_id):
        user = self.get_object(user_id)
        serializer = self.serializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
