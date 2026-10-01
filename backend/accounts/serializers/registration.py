from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..input_cleaning import (
    HumanTextField,
    NameField,
    NormalizedEmailField,
    UsernameField,
    validate_password_policy,
)


class RegistrationSerializer(serializers.Serializer):
    username = UsernameField()
    # Passwords are opaque secrets: never trim or Unicode-normalize them.
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)
    accepted_terms = serializers.BooleanField(write_only=True)
    first_name = NameField()
    last_name = NameField()
    email = NormalizedEmailField(max_length=254)

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
        return validate_password_policy(value)

    def validate_accepted_terms(self, value):
        if not value:
            raise serializers.ValidationError('You must accept the terms to create an account.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        validate_password_policy(
            attrs['password'],
            username=attrs['username'],
            email=attrs['email'],
        )
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
    pass


class SponsorRegistrationSerializer(RegistrationSerializer):
    company_name = HumanTextField(max_length=200)

    def validate_company_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Company name is required.')
        return value
