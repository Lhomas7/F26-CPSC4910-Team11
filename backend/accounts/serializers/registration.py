from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..input_cleaning import (
    HumanTextField,
    NameField,
    NormalizedEmailField,
    UsernameField,
    unsaved_user_from,
    validate_new_password,
)
from ..services import public_sponsor_companies

# Bounds one request's work; there is no limit on sponsors over time.
MAX_SPONSOR_APPLICATIONS = 20


class SponsorIdsField(serializers.ListField):
    """Sponsor organizations a driver is applying to, without duplicates."""

    def __init__(self, **kwargs):
        kwargs.setdefault('required', False)
        kwargs.setdefault('max_length', MAX_SPONSOR_APPLICATIONS)
        super().__init__(
            child=serializers.PrimaryKeyRelatedField(queryset=public_sponsor_companies()),
            **kwargs,
        )

    def to_internal_value(self, data):
        # Bound the raw list: the length validator only sees it after deduplication.
        if isinstance(data, list) and len(data) > self.max_length:
            self.fail('max_length', max_length=self.max_length)
        return list(dict.fromkeys(super().to_internal_value(data)))


class RegistrationSerializer(serializers.Serializer):
    username = UsernameField()
    # Passwords are opaque secrets: never trim or Unicode-normalize them.
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)
    accepted_terms = serializers.BooleanField(write_only=True)
    first_name = NameField()
    last_name = NameField()
    email = NormalizedEmailField(max_length=254)
    # Email verification code, sent on the second submission when an admin
    # requires email verification for new accounts.
    code = serializers.CharField(required=False, allow_blank=True, write_only=True, max_length=12)

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Username is required.')
        if get_user_model().objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('A user with this username already exists.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if get_user_model().objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email address already exists.')
        return value

    def validate_password(self, value):
        # Compared against the submitted username, email, and names, so every
        # password problem is reported together with the other field errors.
        return validate_new_password(value, unsaved_user_from(self.initial_data))

    def validate_accepted_terms(self, value):
        if not value:
            raise serializers.ValidationError('You must accept the terms to create an account.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        return attrs

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
    # Applying to sponsors is optional; a driver can apply later.
    sponsor_ids = SponsorIdsField()


class SponsorRegistrationSerializer(RegistrationSerializer):
    company_name = HumanTextField(max_length=200)

    def validate_company_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Company name is required.')
        return value
