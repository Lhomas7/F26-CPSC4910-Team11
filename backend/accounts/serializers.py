from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
import re


class RegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Username is required.')
        if get_user_model().objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                'A user with this username already exists.'
            )
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if get_user_model().objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                'A user with this email address already exists.'
            )
        return value
    
    def validate_password(self, value):
        if len(value) < 12:
            raise serializers.ValidationError('Password must be at least 12 characters long.')
        if not re.search(r'[A-Za-z]', value):
            raise serializers.ValidationError('Password must contain at least one letter.')
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError('Password must contain at least one number.')
        if not re.search(r'[^A-Za-z0-9]', value):
            raise serializers.ValidationError('Password must contain at least one symbol.')
        return value

    def validate_first_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('First name is required.')
        return value

    def validate_last_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Last name is required.')
        return value


class DriverRegistrationSerializer(RegistrationSerializer):
    pass


class SponsorRegistrationSerializer(RegistrationSerializer):
    company_name = serializers.CharField(max_length=200)

    def validate_company_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Company name is required.')
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class MFASetupSerializer(serializers.Serializer):
    METHOD_CHOICES = [('totp', 'TOTP'), ('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    E164_RE = re.compile(r'^\+[1-9]\d{7,14}$')

    def validate_phone_number(self, value):
        value = (value or '').strip()
        if not value:
            return value
        if not value.startswith('+'):
            if re.fullmatch(r'\d{10}', value):
                value = '+1' + value
            else:
                raise serializers.ValidationError(
                    'Phone number must be in E.164 format (e.g. +18645551234).'
                )
        if not self.E164_RE.match(value):
            raise serializers.ValidationError(
                'Phone number must be in E.164 format (e.g. +18645551234).'
            )
        return value


class MFAVerifySerializer(serializers.Serializer):
    METHOD_CHOICES = [('totp', 'TOTP'), ('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)
    code = serializers.CharField(max_length=6, min_length=6)


class MFARequestCodeSerializer(serializers.Serializer):
    PURPOSE_CHOICES = [('enroll', 'Enroll'), ('login', 'Login'), ('reset', 'Reset')]
    METHOD_CHOICES = [('email', 'Email'), ('sms', 'SMS')]
    purpose = serializers.ChoiceField(choices=PURPOSE_CHOICES)
    method = serializers.ChoiceField(choices=METHOD_CHOICES)


class MFAResetSerializer(serializers.Serializer):
    METHOD_CHOICES = [('email', 'Email'), ('sms', 'SMS')]
    fallback_method = serializers.ChoiceField(choices=METHOD_CHOICES)
    fallback_code = serializers.CharField(max_length=6, min_length=6)


class MFADisableSerializer(serializers.Serializer):
    METHOD_CHOICES = [('totp', 'TOTP'), ('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)
    password = serializers.CharField(write_only=True)


class LoginMFASerializer(serializers.Serializer):
    METHOD_CHOICES = [('totp', 'TOTP'), ('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)
    code = serializers.CharField(max_length=6, min_length=6)


class LoginMFARequestCodeSerializer(serializers.Serializer):
    METHOD_CHOICES = [('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)


class SponsorMFASerializer(serializers.Serializer):
    driver_mfa_required = serializers.BooleanField()

class ChangePasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        if len(value) < 12:
            raise serializers.ValidationError(
                'Password must be at least 12 characters long.'
            )
        if not re.search(r'[A-Za-z]', value):
            raise serializers.ValidationError(
                'Password must contain at least one letter.'
            )
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError(
                'Password must contain at least one number.'
            )
        if not re.search(r'[^A-Za-z0-9]', value):
            raise serializers.ValidationError(
                'Password must contain at least one symbol.'
            )
        return value


class SelfProfileSerializer(serializers.ModelSerializer):
    # Profile data spans Django's User model and the role-specific related model
    name = serializers.CharField(max_length=200)
    account_type = serializers.SerializerMethodField()
    company = serializers.SerializerMethodField()
    mfa = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ('id', 'username', 'name', 'account_type', 'company', 'mfa')
        read_only_fields = ('id', 'account_type', 'company')

    def get_account_type(self, user):
        if hasattr(user, 'driver_profile'):
            return 'driver'
        if hasattr(user, 'sponsor_account'):
            return 'sponsor'
        return None

    def get_mfa(self, user):
        from .services import get_mfa_status
        return get_mfa_status(user)

    def get_company(self, user):
        if hasattr(user, 'driver_profile'):
            sponsor = user.driver_profile.sponsor
            return sponsor.name if sponsor is not None else None
        if hasattr(user, 'sponsor_account'):
            return user.sponsor_account.company.name
        return None

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Username is required.')

        # Treat differently cased usernames as duplicates to avoid ambiguous logins
        duplicate = get_user_model().objects.filter(username__iexact=value)
        if self.instance is not None:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                'A user with this username already exists.'
            )
        return value

    def validate_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Name is required.')
        return value

    def to_representation(self, user):
        # Driver names live on Driver; sponsor names currently live on User
        if hasattr(user, 'driver_profile'):
            name = user.driver_profile.name
        else:
            name = user.get_full_name() or user.get_username()

        return {
            'id': user.id,
            'username': user.get_username(),
            'name': name,
            'account_type': self.get_account_type(user),
            'company': self.get_company(user),
            'mfa': self.get_mfa(user),
        }

    @transaction.atomic
    def update(self, user, validated_data):
        # Keep User and its role-specific profile consistent if either save fails
        name = validated_data.pop('name', None)
        user.username = validated_data.get('username', user.username)

        if hasattr(user, 'driver_profile'):
            if name is not None:
                user.driver_profile.name = name
                user.driver_profile.save(update_fields=['name'])
        elif name is not None:
            user.first_name = name

        user.save()
        return user
