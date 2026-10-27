import logging

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..middleware import client_ip
from ..permissions import MFAEnrolled
from ..sensitive import hide_sensitive_data
from ..serializers import (
    AdminPasswordResetConfirmSerializer,
    AdminPasswordResetRequestSerializer,
    ChangePasswordSerializer,
)
from ..services.admin_password_reset import (
    admin_token_generator,
    can_receive_admin_reset,
    match_second_factor,
    record_admin_reset_event,
    reset_requested_recently,
    send_admin_password_reset_email,
)
from ..services.device_trust import revoke_devices
from ..services.login_audit import record_login_attempt
from ..services.login_throttle import locked_out_response, lockout_seconds_remaining
from ..services.notify import notify_password_reset
from ..services.password_reset import user_from_uid
from ..services.reauth import current_password_error
from .authentication import PASSWORD_RESET_INVALID_LINK_MESSAGE, AnonymousAPIView

logger = logging.getLogger(__name__)


@method_decorator(never_cache, name='dispatch')
@hide_sensitive_data
class AdminPasswordResetRequestView(APIView):
    """An administrator emails another administrator a one-time reset link.

    Needs a signed-in administrator who has completed MFA setup (MFAEnrolled) and
    who re-enters their own password. The target can never be the requester. The
    response never contains the link or the target's email address.
    """

    permission_classes = [IsAdminUser, MFAEnrolled]

    def post(self, request, user_id):
        serializer = AdminPasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requester = request.user

        # Wrong passwords here count toward the same lockout as sign-in, so this
        # prompt cannot be used to guess an administrator's password.
        error = current_password_error(requester, serializer.validated_data['current_password'])
        if error:
            return error

        target = get_object_or_404(
            get_user_model().objects.filter(is_staff=True).exclude(pk=requester.pk),
            pk=user_id,
        )
        if not can_receive_admin_reset(target):
            return Response(
                {
                    'detail': (
                        'This administrator cannot be reset by link because they are '
                        'inactive or have not set up an authenticator app. A server '
                        'administrator can reset them with manage.py changepassword.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if reset_requested_recently(target):
            return Response(
                {
                    'detail': (
                        'A reset link was already sent to this administrator a few '
                        'minutes ago. Ask them to check their email, or try again shortly.'
                    )
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            send_admin_password_reset_email(target, requested_by=requester)
        except Exception:
            logger.exception('Could not send administrator password reset email.')
            return Response(
                {'detail': 'The reset email could not be sent. Try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        record_admin_reset_event(
            target, 'requested', requested_by=requester, ip_address=client_ip(request)
        )
        return Response({'detail': 'A one-time reset link was emailed to that administrator.'})


@hide_sensitive_data
class AdminPasswordResetConfirmView(AnonymousAPIView):
    """Finish an administrator reset: emailed link + authenticator/backup code."""

    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        user = user_from_uid(uid) if isinstance(uid, str) else None
        if (
            user is None
            or not (user.is_staff or user.is_superuser)
            or not isinstance(token, str)
            or not admin_token_generator.check_token(user, token)
        ):
            return Response(
                {'detail': PASSWORD_RESET_INVALID_LINK_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Shape and password-policy checks first, with no account context, so the
        # link alone reveals nothing about the account's current password.
        serializer = AdminPasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['method']
        code = serializer.validated_data['code']

        locked_for = lockout_seconds_remaining(user.get_username())
        if locked_for:
            return locked_out_response(locked_for)

        spend_factor = match_second_factor(user, method, code)
        if spend_factor is None:
            record_login_attempt(user.get_username(), successful=False, user=user)
            record_admin_reset_event(user, 'failed', ip_address=client_ip(request))
            return Response(
                {'code': ['That code is not valid.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Second factor proven: now the rules that depend on the account.
        full = ChangePasswordSerializer(data=request.data, context={'user': user})
        full.is_valid(raise_exception=True)

        spend_factor()
        user.set_password(full.validated_data['password'])
        user.save()
        # Every browser has to answer "Is this your device?" again.
        revoke_devices(user)
        record_admin_reset_event(user, 'completed', ip_address=client_ip(request))

        # Changing the password also ends every existing session and uses up the
        # link, because both are derived from the password hash.
        try:
            notify_password_reset(user)
        except Exception:
            logger.exception('Could not send password reset notification.')

        return Response({'detail': 'Your password has been reset. You can now sign in.'})
