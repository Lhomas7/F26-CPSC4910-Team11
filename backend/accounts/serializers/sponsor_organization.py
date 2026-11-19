import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..input_cleaning import HumanTextField, NormalizedEmailField, normalize_human_text
from ..models import SponsorCompany

DESCRIPTION_MAX_LENGTH = 1000
PHONE_ERROR = 'Enter a valid phone number, including the country code when outside the US.'


def normalize_contact_phone(value):
    """Return one consistent E.164 number, or '' when none was given."""
    value = (value or '').strip()
    if not value:
        return ''
    # Accept familiar US punctuation, then store one consistent E.164 value.
    compact = re.sub(r'[\s().-]', '', value)
    if compact.isdigit() and len(compact) == 10:
        compact = f'+1{compact}'
    if not re.fullmatch(r'\+[1-9]\d{7,14}', compact):
        raise serializers.ValidationError(PHONE_ERROR)
    return compact


class SponsorOrganizationSerializer(serializers.ModelSerializer):
    """The details of a sponsor organization that its drivers can see.

    Sponsors edit every field here. Drivers only ever read this through their
    own sponsor, and it deliberately leaves out settings such as the catalog
    rate and the driver MFA requirement.
    """

    # Declared here, so uniqueness is checked in validate_name (ignoring case).
    name = HumanTextField(max_length=200)
    description = HumanTextField(
        required=False,
        allow_blank=True,
        max_length=DESCRIPTION_MAX_LENGTH,
        error_messages={
            'max_length': f'Description must be {DESCRIPTION_MAX_LENGTH} characters or fewer.'
        },
    )
    website = serializers.URLField(required=False, allow_blank=True, max_length=200)
    contact_email = NormalizedEmailField(required=False, allow_blank=True, max_length=254)
    contact_phone = serializers.CharField(required=False, allow_blank=True, max_length=40)
    support_contact_name = HumanTextField(required=False, allow_blank=True, max_length=100)
    support_email = NormalizedEmailField(required=False, allow_blank=True, max_length=254)
    support_phone = serializers.CharField(required=False, allow_blank=True, max_length=40)
    support_hours = HumanTextField(required=False, allow_blank=True, max_length=200)

    class Meta:
        model = SponsorCompany
        fields = (
            'id',
            'name',
            'description',
            'website',
            'contact_email',
            'contact_phone',
            'support_contact_name',
            'support_email',
            'support_phone',
            'support_hours',
        )
        read_only_fields = ('id',)

    def validate_name(self, value):
        value = normalize_human_text(value)
        if not value:
            raise serializers.ValidationError('Organization name is required.')
        duplicates = SponsorCompany.objects.filter(name__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError('An organization with this name already exists.')
        return value

    def validate_website(self, value):
        value = value.strip()
        # URLField also accepts ftp:// links; a public website must be http(s).
        if value and not re.match(r'^https?://', value, re.IGNORECASE):
            raise serializers.ValidationError(
                'Enter a website address starting with http:// or https://.'
            )
        return value

    def validate_contact_phone(self, value):
        return normalize_contact_phone(value)

    def validate_support_phone(self, value):
        return normalize_contact_phone(value)


class SponsorTeamMemberSerializer(serializers.ModelSerializer):
    """A sponsor user at the signed-in sponsor's company, for team management."""

    name = serializers.SerializerMethodField()
    is_self = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ('id', 'name', 'username', 'email', 'is_active', 'is_self')
        read_only_fields = fields

    def get_name(self, user):
        return user.get_full_name() or user.get_username()

    def get_is_self(self, user):
        request = self.context.get('request')
        return bool(request and request.user.pk == user.pk)


class SponsorTeamMemberStatusSerializer(serializers.Serializer):
    """Turns one teammate's account off, or back on."""

    is_active = serializers.BooleanField()
    current_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, trim_whitespace=False
    )
