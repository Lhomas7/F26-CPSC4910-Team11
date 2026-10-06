import base64
import io

import pyotp
import qrcode

from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drivers.models import Driver

from ..permissions import MFAEnrolled
from ..serializers import (
    BackupCodesRegenerateSerializer,
    MFADisableSerializer,
    MFARequestCodeSerializer,
    MFAResetSerializer,
    MFASetupSerializer,
    MFAVerifySerializer,
    SponsorMFASerializer,
)
from ..services import get_mfa_allowed_methods, get_mfa_status
from ..services.crypto import decrypt_secret, encrypt_secret
from ..services.delivery import send_email_code, send_sms_code
from ..services.mfa import (
    backup_codes_remaining,
    clear_backup_codes,
    create_mfa_code,
    generate_backup_codes,
    get_or_create_mfa_settings,
    verify_backup_code,
    verify_code,
)
from ..services.notify import notify_driver_mfa_change
from ..sensitive import hide_sensitive_data

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


class MFAStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'mfa': get_mfa_status(request.user)})


@hide_sensitive_data
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



@hide_sensitive_data
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


@hide_sensitive_data
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


@hide_sensitive_data
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


@hide_sensitive_data
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

