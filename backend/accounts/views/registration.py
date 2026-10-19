import hashlib

from django.contrib.auth import get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from drivers.models import Driver

from ..models import RegistrationSettings, SponsorAccount, SponsorCompany
from ..sensitive import hide_sensitive_data
from ..serializers import DriverRegistrationSerializer, SponsorRegistrationSerializer
from ..services import get_public_user, normalize_company_name
from ..services.delivery import send_code_to_address
from ..services.registration_verification import (
    create_registration_code,
    verify_registration_code,
)

REGISTRATION_CODE_RESEND_SECONDS = 30
INVALID_REGISTRATION_CODE_MESSAGE = 'Invalid or expired verification code.'


class AnonymousAPIView(APIView):
    authentication_classes = ()
    permission_classes = ()


def check_email_verification(data):
    """Gate account creation on proof of email control when an admin requires it.

    Returns a Response to send instead of creating the account, or None when the
    account may be created. The first submission (no code) emails a code and
    returns 202; the client then resubmits the same details with that code.
    """
    if not RegistrationSettings.load().email_verification_required:
        return None

    email = data['email']
    code = data.get('code')
    if code:
        if not verify_registration_code(email, code):
            raise DRFValidationError({'code': [INVALID_REGISTRATION_CODE_MESSAGE]})
        return None

    # One code per address per window stops the endpoint being used to spam a
    # mailbox, matching the password reset cooldown.
    digest = hashlib.sha256(email.casefold().encode()).hexdigest()
    if not cache.add(f'registration_code:{digest}', '1', REGISTRATION_CODE_RESEND_SECONDS):
        return Response(
            {'detail': 'Please wait before requesting a new code.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    send_code_to_address(email, create_registration_code(email))
    return Response(
        {
            'verification_required': True,
            'email': email,
            'detail': 'We sent a verification code to your email address.',
        },
        status=status.HTTP_202_ACCEPTED,
    )


@hide_sensitive_data
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
            raise DRFValidationError({'password': list(exc.messages)}) from exc

        verification_response = check_email_verification(data)
        if verification_response is not None:
            return verification_response

        with transaction.atomic():
            user.set_password(data['password'])
            user.save()
            Driver.objects.create(user=user, name=user.get_full_name())

        return Response(get_public_user(user), status=status.HTTP_201_CREATED)


@hide_sensitive_data
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
            raise DRFValidationError({'password': list(exc.messages)}) from exc

        verification_response = check_email_verification(data)
        if verification_response is not None:
            return verification_response

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
