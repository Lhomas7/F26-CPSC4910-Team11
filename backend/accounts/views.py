import base64
import hashlib
import io
import logging
from datetime import timedelta

import pyotp
import qrcode

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drivers.models import Driver

from .middleware import (
    IMPERSONATION_STARTED_KEY,
    IMPERSONATION_TARGET_KEY,
    clear_impersonation,
    client_ip,
    impersonation_details,
)
from .models import AdminImpersonationEvent, SponsorAccount, SponsorCompany
from .permissions import MFAEnrolled

from .serializers import (
    AdminAccountDetailSerializer,
    AdminDriverDetailSerializer,
    AdminSponsorDetailSerializer,
    AdminUserCreateSerializer,
    AdminUserListSerializer,
    BackupCodesRegenerateSerializer,
    ChangePasswordSerializer,
    DriverRegistrationSerializer,
    LoginMFASerializer,
    LoginMFARequestCodeSerializer,
    LoginSerializer,
    MFADisableSerializer,
    MFARequestCodeSerializer,
    MFAResetSerializer,
    MFASetupSerializer,
    MFAVerifySerializer,
    PasswordResetRequestSerializer,
    SelfProfileSerializer,
    SponsorCompanySerializer,
    SponsorMFASerializer,
    SponsorRegistrationSerializer,
)
from .services import (
    get_account_type,
    get_mfa_allowed_methods,
    get_mfa_status,
    get_public_user,
    normalize_company_name,
)
from .services.crypto import decrypt_secret, encrypt_secret
from .services.delivery import send_email_code, send_sms_code
from .services.login_audit import record_login_attempt
from .services.mfa import (
    backup_codes_remaining,
    clear_backup_codes,
    create_mfa_code,
    generate_backup_codes,
    get_or_create_mfa_settings,
    verify_backup_code,
    verify_code,
)
from .services.notify import notify_driver_mfa_change, notify_password_reset
from .services.password_reset import (
    find_resettable_users,
    send_password_reset_email,
    token_is_valid,
    user_from_uid,
)

logger = logging.getLogger(__name__)

MFA_METHOD_LABELS = {
    'email': 'email code',
    'sms': 'text message',
    'totp': 'authenticator app',
}


def notify_method_change(user, method, action):
    """Drivers get an in-app notification + email when their MFA setup changes."""
    if not hasattr(user, 'driver_profile'):
        return
    label = MFA_METHOD_LABELS.get(method, method)
    message = (
        f'You {action} {label} two-factor authentication '
        'on your Good Driver account.'
    )
    notify_driver_mfa_change(user.driver_profile, message)


class AnonymousAPIView(APIView):
    authentication_classes = ()
    permission_classes = ()


def totp_qr_payload(user, secret):
    """Build a {qr_code(data-URI PNG), manual_key} payload for TOTP setup/reset."""
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.get_username(),
        issuer_name='Good Driver',
    )
    buf = io.BytesIO()
    qrcode.make(uri).save(buf, format='PNG')
    qr_data_uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    return {'qr_code': qr_data_uri, 'manual_key': secret}


class DriverRegistrationView(AnonymousAPIView):
    def post(self, request):
        serializer = DriverRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = get_user_model()(
            username=data['username'],
            first_name=data['first_name'],
            last_name=data['last_name'],
            email=data['email'],
        )
        try:
            validate_password(data['password'], user)
        except DjangoValidationError as exc:
            raise DRFValidationError({'password': list(exc.messages)})

        with transaction.atomic():
            user.set_password(data['password'])
            user.save()
            Driver.objects.create(user=user, name=user.get_full_name())

        return Response(get_public_user(user), status=status.HTTP_201_CREATED)


class SponsorRegistrationView(AnonymousAPIView):
    def post(self, request):
        serializer = SponsorRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = get_user_model()(
            username=data['username'],
            first_name=data['first_name'],
            last_name=data['last_name'],
            email=data['email'],
        )
        try:
            validate_password(data['password'], user)
        except DjangoValidationError as exc:
            raise DRFValidationError({'password': list(exc.messages)})

        with transaction.atomic():
            user.set_password(data['password'])
            user.save()

            company_name = normalize_company_name(data['company_name'])
            company, _ = SponsorCompany.objects.get_or_create(name=company_name)
            SponsorAccount.objects.create(user=user, company=company)

        # Sponsors must complete MFA onboarding before the account is usable, so
        # establish a session right away and let the frontend show the setup wall.
        login(request, user)
        return Response(get_public_user(user), status=status.HTTP_201_CREATED)


class LoginView(AnonymousAPIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username'].strip()
        password = serializer.validated_data['password']

        user = authenticate(request, username=username, password=password)
        if user is None or get_account_type(user) is None:
            record_login_attempt(username, successful=False)
            return Response(
                {'detail': 'Invalid username or password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa = getattr(user, 'mfa_settings', None)
        if mfa is not None and mfa.any_enabled:
            # Stage a pending-MFA session. No authenticated session exists yet.
            # Codes are NOT sent here: the user picks their method on the second
            # step, then POST /login/mfa/request-code/ delivers a code for that
            # method only.
            request.session['pending_mfa_user_id'] = user.id
            request.session['pending_mfa_expires'] = (
                timezone.now() + timedelta(minutes=5)
            ).isoformat()
            request.session['pending_mfa_attempts'] = 0
            request.session.set_expiry(300)

            # The password step alone is not a completed sign-in; the outcome is
            # recorded when the second factor succeeds or fails.
            return Response({'mfa': get_mfa_status(user)})

        login(request, user)
        record_login_attempt(user.get_username(), successful=True)
        return Response(get_public_user(user))


class LoginMFAView(AnonymousAPIView):
    def post(self, request):
        serializer = LoginMFASerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['method']
        code = serializer.validated_data['code']

        pending_user_id = request.session.get('pending_mfa_user_id')
        pending_expires_str = request.session.get('pending_mfa_expires')
        pending_attempts = request.session.get('pending_mfa_attempts', 0)

        if pending_user_id is None:
            return Response(
                {'detail': 'Session expired, log in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pending_expires = parse_datetime(pending_expires_str)
        if pending_expires is None or timezone.now() > pending_expires:
            self._clear_pending_mfa(request)
            return Response(
                {'detail': 'Session expired, log in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if pending_attempts >= 5:
            self._clear_pending_mfa(request)
            return Response(
                {'detail': 'Too many attempts, log in again.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            user = get_user_model().objects.get(id=pending_user_id)
        except get_user_model().DoesNotExist:
            self._clear_pending_mfa(request)
            return Response(
                {'detail': 'Session expired, log in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verified = False
        if method == 'totp':
            mfa = getattr(user, 'mfa_settings', None)
            if mfa is not None and mfa.totp_enabled and mfa.totp_secret_encrypted:
                secret = decrypt_secret(mfa.totp_secret_encrypted)
                verified = pyotp.TOTP(secret).verify(code)
        elif method == 'backup':
            verified = verify_backup_code(user, code)
        else:
            verified = verify_code(user, purpose='login', method=method, raw_code=code)

        if not verified:
            request.session['pending_mfa_attempts'] = pending_attempts + 1
            record_login_attempt(user.get_username(), successful=False)
            return Response(
                {'detail': 'Invalid code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self._clear_pending_mfa(request)
        login(request, user)
        record_login_attempt(user.get_username(), successful=True)
        return Response(get_public_user(user))

    def _clear_pending_mfa(self, request):
        for key in ('pending_mfa_user_id', 'pending_mfa_expires', 'pending_mfa_attempts'):
            request.session.pop(key, None)
        request.session.set_expiry(0)


class LoginMFARequestCodeView(AnonymousAPIView):
    """Send a login-purpose code for a single method during the staged MFA step.

    Anonymous like /login/mfa/ because no authenticated session exists yet; the
    pending session (set by POST /login/) identifies the user.
    """

    def post(self, request):
        pending_user_id = request.session.get('pending_mfa_user_id')
        if pending_user_id is None:
            return Response(
                {'detail': 'Session expired, log in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pending_expires = parse_datetime(request.session.get('pending_mfa_expires'))
        if pending_expires is None or timezone.now() > pending_expires:
            return Response(
                {'detail': 'Session expired, log in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = get_user_model().objects.get(id=pending_user_id)
        except get_user_model().DoesNotExist:
            return Response(
                {'detail': 'Session expired, log in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LoginMFARequestCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['method']

        mfa = getattr(user, 'mfa_settings', None)
        if mfa is None or not getattr(mfa, f'{method}_enabled', False):
            return Response(
                {'detail': f'{method.title()} is not enabled for this account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if method == 'sms' and not mfa.phone_number:
            return Response(
                {'detail': 'No phone number on file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        throttle_key = f'mfa_resend:{user.id}'
        if not cache.add(throttle_key, '1', 30):
            return Response(
                {'detail': 'Please wait before requesting a new code.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        raw_code = create_mfa_code(user, purpose='login', method=method)
        if method == 'email':
            send_email_code(user, raw_code)
        else:
            send_sms_code(mfa.phone_number or '', raw_code)
        return Response({'detail': 'Verification code sent.'})


class MeView(APIView):
    permission_classes = ()

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response({'authenticated': False})
        public_user = get_public_user(user)
        if public_user is None:
            return Response({'authenticated': False})
        if getattr(request, 'impersonation_active', False):
            public_user['impersonation'] = impersonation_details(request, user)
        return Response({'authenticated': True, 'user': public_user})


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


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'user': request.user})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data['password'])
        user.save()

        return Response(
            {'detail': 'Password changed successfully.'},
            status=status.HTTP_200_OK,
        )


PASSWORD_RESET_REQUEST_MESSAGE = (
    'If an account uses that email address, a password reset link has been sent.'
)
PASSWORD_RESET_INVALID_LINK_MESSAGE = 'This password reset link is invalid or has expired.'


class PasswordResetRequestView(AnonymousAPIView):
    """Email a reset link. The response never reveals whether an account exists."""

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        # One email per address per cooldown window stops the endpoint being used
        # to spam a mailbox. Throttled and unknown addresses get the same reply.
        digest = hashlib.sha256(email.casefold().encode()).hexdigest()
        if cache.add(f'password_reset:{digest}', '1', settings.PASSWORD_RESET_REQUEST_COOLDOWN):
            for user in find_resettable_users(email):
                try:
                    send_password_reset_email(user)
                except Exception:
                    # Delivery problems must not change the response, or they
                    # would reveal which addresses have accounts.
                    logger.exception('Could not send password reset email.')

        return Response({'detail': PASSWORD_RESET_REQUEST_MESSAGE})


class PasswordResetConfirmView(AnonymousAPIView):
    """Set a new password using the uid/token from the emailed link."""

    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        user = user_from_uid(uid) if isinstance(uid, str) else None
        if user is None or not isinstance(token, str) or not token_is_valid(user, token):
            return Response(
                {'detail': PASSWORD_RESET_INVALID_LINK_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ChangePasswordSerializer(data=request.data, context={'user': user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data['password'])
        user.save()

        # Changing the password invalidates the token (and every existing session,
        # because the session hash is derived from the password hash).
        try:
            notify_password_reset(user)
        except Exception:
            logger.exception('Could not send password reset notification.')

        return Response({'detail': 'Your password has been reset. You can now sign in.'})


class SelfProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # This endpoint is intentionally self-scoped and accepts no user ID
        return Response(
            SelfProfileSerializer(request.user, context={'request': request}).data
        )

    def patch(self, request):
        # Read-only serializer fields prevent role, company, and ID changes
        serializer = SelfProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


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


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CSRFView(AnonymousAPIView):
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class MFAStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'mfa': get_mfa_status(request.user)})


class MFASetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFASetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['method']
        user = request.user

        if method not in get_mfa_allowed_methods(user):
            return Response(
                {'detail': f'{method.title()} is not available for this account type.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if method == 'totp':
            mfa = get_or_create_mfa_settings(user)
            if mfa.totp_enabled:
                return Response(
                    {'detail': 'TOTP is already enabled.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            secret = pyotp.random_base32()
            mfa.totp_secret_encrypted = encrypt_secret(secret)
            mfa.save(update_fields=['totp_secret_encrypted'])
            return Response(totp_qr_payload(user, secret))

        phone_number = serializer.validated_data.get('phone_number', '').strip()
        if method == 'sms' and not phone_number:
            return Response(
                {'phone_number': ['This field is required when method is sms.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa = get_or_create_mfa_settings(user)
        if method == 'sms':
            mfa.phone_number = phone_number
            mfa.save(update_fields=['phone_number'])

        raw_code = create_mfa_code(user, purpose='enroll', method=method)
        if method == 'email':
            send_email_code(user, raw_code)
        else:
            send_sms_code(phone_number, raw_code)
        return Response({'method': method, 'detail': 'Verification code sent.'})



class MFAVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFAVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['method']
        code = serializer.validated_data['code']
        user = request.user

        if method == 'totp':
            mfa = getattr(user, 'mfa_settings', None)
            if mfa is None or not mfa.totp_secret_encrypted:
                return Response(
                    {'detail': 'TOTP has not been set up.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            secret = decrypt_secret(mfa.totp_secret_encrypted)
            if not pyotp.TOTP(secret).verify(code):
                return Response(
                    {'detail': 'Invalid code.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            was_enrolled = mfa.any_enabled
            mfa.totp_enabled = True
            mfa.save(update_fields=['totp_enabled'])
            notify_method_change(user, 'totp', 'enabled')
            response = {'detail': 'TOTP enabled.'}
            if not was_enrolled:
                response['backup_codes'] = generate_backup_codes(user)
            return Response(response)

        if not verify_code(user, purpose='enroll', method=method, raw_code=code):
            return Response(
                {'detail': 'Invalid code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        mfa = get_or_create_mfa_settings(user)
        was_enrolled = mfa.any_enabled
        field = f'{method}_enabled'
        setattr(mfa, field, True)
        mfa.save(update_fields=[field])
        notify_method_change(user, method, 'enabled')
        response = {'detail': f'{method.title()} enabled.'}
        if not was_enrolled:
            response['backup_codes'] = generate_backup_codes(user)
        return Response(response)


class MFARequestCodeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFARequestCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purpose = serializer.validated_data['purpose']
        method = serializer.validated_data['method']
        user = request.user

        throttle_key = f'mfa_resend:{user.id}'
        if not cache.add(throttle_key, '1', 30):
            return Response(
                {'detail': 'Please wait before requesting a new code.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if method == 'sms':
            mfa = getattr(user, 'mfa_settings', None)
            phone_number = None
            if mfa is not None and mfa.phone_number:
                phone_number = mfa.phone_number
            if not phone_number:
                return Response(
                    {'detail': 'No phone number on file.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            phone_number = None

        raw_code = create_mfa_code(user, purpose=purpose, method=method)
        if method == 'email':
            send_email_code(user, raw_code)
        else:
            send_sms_code(phone_number, raw_code)
        return Response({'detail': 'Verification code sent.'})


class MFAResetView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFAResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['fallback_method']
        code = serializer.validated_data['fallback_code']
        user = request.user

        mfa = getattr(user, 'mfa_settings', None)
        if mfa is None or not mfa.totp_enabled:
            return Response(
                {'detail': 'TOTP is not enabled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if method == 'backup':
            if backup_codes_remaining(user) < 1:
                return Response(
                    {'detail': 'No backup codes remaining.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not verify_backup_code(user, code):
                return Response(
                    {'detail': 'Invalid fallback code.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if not getattr(mfa, f'{method}_enabled', False):
                return Response(
                    {'detail': f'{method.title()} is not enabled as a fallback.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if method == 'sms' and not mfa.phone_number:
                return Response(
                    {'detail': 'No phone number on file.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not verify_code(user, purpose='reset', method=method, raw_code=code):
                return Response(
                    {'detail': 'Invalid fallback code.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        new_secret = pyotp.random_base32()
        mfa.totp_secret_encrypted = encrypt_secret(new_secret)
        mfa.save(update_fields=['totp_secret_encrypted'])
        return Response(totp_qr_payload(user, new_secret))


class MFADisableView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFADisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['method']
        password = serializer.validated_data['password']
        user = request.user

        if not user.check_password(password):
            return Response(
                {'detail': 'Incorrect password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa = getattr(user, 'mfa_settings', None)
        if mfa is None:
            return Response(
                {'detail': f'{method.title()} is not enabled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if method == 'totp':
            if not mfa.totp_enabled:
                return Response(
                    {'detail': 'TOTP is not enabled.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            mfa.totp_enabled = False
            mfa.totp_secret_encrypted = None
            mfa.save(update_fields=['totp_enabled', 'totp_secret_encrypted'])
        else:
            field = f'{method}_enabled'
            if not getattr(mfa, field, False):
                return Response(
                    {'detail': f'{method.title()} is not enabled.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            setattr(mfa, field, False)
            mfa.save(update_fields=[field])

        if not mfa.any_enabled:
            clear_backup_codes(user)

        notify_method_change(user, method, 'disabled')
        return Response({'detail': f'{method.title()} disabled.'})


class MFABackupCodesRegenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BackupCodesRegenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user

        if not user.check_password(serializer.validated_data['password']):
            return Response(
                {'detail': 'Incorrect password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa = getattr(user, 'mfa_settings', None)
        if mfa is None or not mfa.any_enabled:
            return Response(
                {'detail': 'Set up a two-factor method before generating backup codes.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({'backup_codes': generate_backup_codes(user)})


class SponsorMFASettingsView(APIView):
    permission_classes = [IsAuthenticated, MFAEnrolled]

    def get(self, request):
        user = request.user
        if not hasattr(user, 'sponsor_account') or user.sponsor_account is None:
            return Response(
                {'detail': 'Only a sponsor can manage this setting.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        company = user.sponsor_account.company
        return Response({'driver_mfa_required': company.driver_mfa_required})

    def post(self, request):
        serializer = SponsorMFASerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        driver_mfa_required = serializer.validated_data['driver_mfa_required']
        user = request.user

        if not hasattr(user, 'sponsor_account') or user.sponsor_account is None:
            return Response(
                {'detail': 'Only a sponsor can manage this setting.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        company = user.sponsor_account.company
        company.driver_mfa_required = driver_mfa_required
        company.save(update_fields=['driver_mfa_required'])

        drivers = Driver.objects.filter(sponsor=company).select_related('user')
        for driver in drivers:
            message = (
                'Your sponsor now requires multi-factor authentication. '
                'Please set up MFA in your account.'
                if driver_mfa_required
                else 'MFA is no longer required for your account.'
            )
            notify_driver_mfa_change(
                driver,
                message,
                subject='Multi-factor authentication requirement changed',
            )

        return Response({'driver_mfa_required': driver_mfa_required})
