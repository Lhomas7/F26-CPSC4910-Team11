from django.contrib.auth import get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from drivers.models import Driver

from ..models import SponsorAccount, SponsorCompany
from ..serializers import DriverRegistrationSerializer, SponsorRegistrationSerializer
from ..services import get_public_user, normalize_company_name
from ..sensitive import hide_sensitive_data

class AnonymousAPIView(APIView):
    authentication_classes = ()
    permission_classes = ()

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
            raise DRFValidationError({'password': list(exc.messages)})

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

