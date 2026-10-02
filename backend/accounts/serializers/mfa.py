import re

from rest_framework import serializers


class MFASetupSerializer(serializers.Serializer):
    METHOD_CHOICES = [('totp', 'TOTP'), ('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)
    phone_number = serializers.RegexField(
        r'^\+[1-9]\d{7,14}$',
        max_length=16,
        required=False,
        allow_blank=True,
        error_messages={
            'invalid': 'Enter a valid international phone number.'
        },
    )
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
    METHOD_CHOICES = [('email', 'Email'), ('sms', 'SMS'), ('backup', 'Backup code')]
    fallback_method = serializers.ChoiceField(choices=METHOD_CHOICES)
    fallback_code = serializers.CharField(max_length=20, trim_whitespace=True)

    def validate(self, attrs):
        validate_code_for_method(
            attrs['fallback_method'], attrs['fallback_code'], field_name='fallback_code'
        )
        return attrs


class MFADisableSerializer(serializers.Serializer):
    METHOD_CHOICES = [('totp', 'TOTP'), ('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class BackupCodesRegenerateSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)


def validate_code_for_method(method, code, field_name='code'):
    """A 6-digit code for totp/email/sms, or a 10-character backup code."""
    if method == 'backup':
        normalized = ''.join(ch for ch in (code or '').upper() if ch.isalnum())
        if len(normalized) != 10:
            raise serializers.ValidationError({field_name: 'Enter a 10-character backup code.'})
        return
    if not (code or '').isdigit() or len(code or '') != 6:
        raise serializers.ValidationError({field_name: 'Enter the 6-digit code.'})


class LoginMFASerializer(serializers.Serializer):
    METHOD_CHOICES = [('totp', 'TOTP'), ('email', 'Email'), ('sms', 'SMS'), ('backup', 'Backup code')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)
    code = serializers.CharField(max_length=20, trim_whitespace=True)

    def validate(self, attrs):
        validate_code_for_method(attrs['method'], attrs['code'])
        return attrs


class LoginMFARequestCodeSerializer(serializers.Serializer):
    METHOD_CHOICES = [('email', 'Email'), ('sms', 'SMS')]
    method = serializers.ChoiceField(choices=METHOD_CHOICES)


class SponsorMFASerializer(serializers.Serializer):
    driver_mfa_required = serializers.BooleanField()
