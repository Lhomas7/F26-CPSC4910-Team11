import hashlib
import logging
from datetime import timedelta

import pyotp

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..middleware import impersonation_details
from ..serializers import (
    ChangePasswordSerializer,
    LoginMFARequestCodeSerializer,
    LoginMFASerializer,
    LoginSerializer,
    PasswordResetRequestSerializer,
)
from ..services import get_account_type, get_mfa_status, get_public_user
from ..services.crypto import decrypt_secret
from ..services.delivery import send_email_code, send_sms_code
from ..services.login_audit import record_login_attempt
from ..services.mfa import create_mfa_code, verify_backup_code, verify_code
from ..services.notify import notify_password_reset
from ..services.password_reset import (
    find_resettable_users,
    send_password_reset_email,
    token_is_valid,
    user_from_uid,
)

logger = logging.getLogger(__name__)

class AnonymousAPIView(APIView):
    authentication_classes = ()
    permission_classes = ()

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



@method_decorator(ensure_csrf_cookie, name='dispatch')
class CSRFView(AnonymousAPIView):
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)
