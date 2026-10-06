from rest_framework import serializers

from ..input_cleaning import IdentifierField


class LoginSerializer(serializers.Serializer):
    username = IdentifierField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class DeviceCheckSerializer(serializers.Serializer):
    trusted = serializers.BooleanField()
