from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drivers.models import Driver

from .models import SponsorAccount, SponsorCompany
from .serializers import (
    ChangePasswordSerializer,
    DriverRegistrationSerializer,
    LoginSerializer,
    SelfProfileSerializer,
    SponsorRegistrationSerializer,
)
from .services import get_account_type, get_public_user, normalize_company_name


class AnonymousAPIView(APIView):
    authentication_classes = ()
    permission_classes = ()


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

        return Response(get_public_user(user), status=status.HTTP_201_CREATED)


class LoginView(AnonymousAPIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username'].strip()
        password = serializer.validated_data['password']

        user = authenticate(request, username=username, password=password)
        if user is None or get_account_type(user) is None:
            return Response(
                {'detail': 'Invalid username or password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)
        return Response(get_public_user(user))


class MeView(APIView):
    permission_classes = ()

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response({'authenticated': False})
        public_user = get_public_user(user)
        if public_user is None:
            return Response({'authenticated': False})
        return Response({'authenticated': True, 'user': public_user})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data['password'])
        user.save()

        return Response(
            {'detail': 'Password changed successfully.'},
            status=status.HTTP_200_OK,
        )


class SelfProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # This endpoint is intentionally self-scoped and accepts no user ID
        return Response(SelfProfileSerializer(request.user).data)

    def patch(self, request):
        # Read-only serializer fields prevent role, company, and ID changes
        serializer = SelfProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CSRFView(AnonymousAPIView):
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)
