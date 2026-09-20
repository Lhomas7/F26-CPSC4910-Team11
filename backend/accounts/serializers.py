from django.contrib.auth import get_user_model
from rest_framework import serializers
import re


class RegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    name = serializers.CharField(max_length=200)

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Username is required.')
        if get_user_model().objects.filter(username=value).exists():
            raise serializers.ValidationError(
                'A user with this username already exists.'
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

    def validate_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Name is required.')
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