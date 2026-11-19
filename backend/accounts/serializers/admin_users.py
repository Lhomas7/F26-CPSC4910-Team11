import re

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from drivers.models import Driver
from drivers.services import admin_assign_sponsors
from drivers.services.reasons import MAX_REASON_LENGTH

from ..input_cleaning import (
    HumanTextField,
    NameField,
    NormalizedEmailField,
    UsernameField,
    unsaved_user_from,
    validate_new_password,
)
from ..models import RegistrationSettings, SponsorAccount, SponsorCompany
from ..services import get_account_type
from ..services.impersonation import view_as_eligibility

STATUS_HISTORY_LIMIT = 50


class AdminDriverSponsorAssignSerializer(serializers.Serializer):
    sponsor_ids = serializers.PrimaryKeyRelatedField(
        queryset=SponsorCompany.objects.all(),
        many=True,
        allow_empty=False,
    )


class AdminDriverSponsorRemoveSerializer(serializers.Serializer):
    # The service enforces the real rules; this only bounds the payload size.
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
        max_length=MAX_REASON_LENGTH + 1,
    )


class AdminUserListSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    sponsor_orgs = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = (
            'id',
            'display_name',
            'username',
            'role',
            'sponsor_orgs',
            'is_active',
        )

    def get_display_name(self, user):
        if hasattr(user, 'driver_profile'):
            return user.driver_profile.name
        return user.get_full_name() or user.get_username()

    def get_role(self, user):
        return get_account_type(user)

    def get_sponsor_orgs(self, user):
        """A sponsor's organization, or every sponsor a driver is active with."""
        if hasattr(user, 'driver_profile'):
            return [
                {'id': membership.sponsor_id, 'name': membership.sponsor.name}
                for membership in user.driver_profile.memberships.all()
                if membership.is_active
            ]
        if hasattr(user, 'sponsor_account'):
            company = user.sponsor_account.company
            return [{'id': company.id, 'name': company.name}]
        return []


class SponsorCompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = SponsorCompany
        fields = ('id', 'name')


class RegistrationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationSettings
        fields = ('email_verification_required', 'updated_at')
        read_only_fields = ('updated_at',)


class AdminAccountDetailSerializer(serializers.ModelSerializer):
    """Editable identity fields for an administrator other than the caller."""

    first_name = NameField()
    last_name = NameField()
    username = UsernameField()
    email = NormalizedEmailField(max_length=254)
    role = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = (
            'id',
            'first_name',
            'last_name',
            'username',
            'email',
            'role',
            'is_active',
        )
        read_only_fields = ('id', 'role')

    def get_role(self, user):
        return 'admin'

    def validate_username(self, value):
        users = get_user_model().objects.filter(username__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError('That username is already taken.')
        return value

    def validate_email(self, value):
        users = get_user_model().objects.filter(email__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError('An account already uses that email address.')
        return value


class ViewAsEligibilityMixin:
    def get_view_as(self, user):
        blocked = view_as_eligibility(user)
        return {
            'eligible': blocked is None,
            'code': blocked['code'] if blocked else None,
            'detail': blocked['detail'] if blocked else None,
        }


class AdminSponsorDetailSerializer(ViewAsEligibilityMixin, serializers.ModelSerializer):
    first_name = NameField()
    last_name = NameField()
    username = UsernameField()
    email = NormalizedEmailField(max_length=254)
    role = serializers.SerializerMethodField()
    view_as = serializers.SerializerMethodField()
    sponsor_org = serializers.SerializerMethodField()
    sponsor_org_id = serializers.PrimaryKeyRelatedField(
        queryset=SponsorCompany.objects.all(),
        source='sponsor_account.company',
        write_only=True,
    )

    class Meta:
        model = get_user_model()
        fields = (
            'id',
            'first_name',
            'last_name',
            'username',
            'email',
            'role',
            'view_as',
            'sponsor_org',
            'sponsor_org_id',
            'is_active',
        )
        read_only_fields = ('id', 'role', 'sponsor_org')

    def get_role(self, user):
        return 'sponsor'

    def get_sponsor_org(self, user):
        company = user.sponsor_account.company
        return {'id': company.id, 'name': company.name}

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

    def validate_username(self, value):
        value = value.strip()
        if not re.fullmatch(r'[A-Za-z0-9._-]{3,30}', value):
            raise serializers.ValidationError(
                'Use 3 to 30 letters, numbers, periods, dashes, or underscores.'
            )
        users = get_user_model().objects.filter(username__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError('That username is already taken.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        users = get_user_model().objects.filter(email__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError('An account already uses that email address.')
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        sponsor_data = validated_data.pop('sponsor_account', {})
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if 'company' in sponsor_data:
            instance.sponsor_account.company = sponsor_data['company']
            instance.sponsor_account.save(update_fields=['company'])
        return instance


class AdminDriverDetailSerializer(ViewAsEligibilityMixin, serializers.ModelSerializer):
    display_name = HumanTextField(source='driver_profile.name', max_length=200)
    username = UsernameField()
    email = NormalizedEmailField(max_length=254)
    role = serializers.SerializerMethodField()
    view_as = serializers.SerializerMethodField()
    sponsor_memberships = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()
    profile_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = (
            'id',
            'display_name',
            'username',
            'email',
            'role',
            'view_as',
            'sponsor_memberships',
            'status_history',
            'is_active',
            'profile_picture_url',
        )
        read_only_fields = (
            'id',
            'role',
            'sponsor_memberships',
            'status_history',
            'profile_picture_url',
        )

    def get_role(self, user):
        return 'driver'

    def get_sponsor_memberships(self, user):
        """Every sponsor the driver is associated with, with that sponsor's balance."""
        driver = user.driver_profile
        return [
            {
                'sponsor': {'id': membership.sponsor_id, 'name': membership.sponsor.name},
                'status': membership.status,
                'point_balance': driver.point_balance_for(membership.sponsor_id),
                'updated_at': membership.updated_at,
            }
            for membership in driver.memberships.select_related('sponsor')
        ]

    def get_status_history(self, user):
        changes = user.driver_profile.status_changes.select_related(
            'sponsor', 'changed_by_user'
        )[:STATUS_HISTORY_LIMIT]
        return [
            {
                'id': change.id,
                'sponsor': {'id': change.sponsor_id, 'name': change.sponsor.name},
                'action': change.action,
                'reason': change.reason,
                'changed_by': (
                    change.changed_by_user.get_full_name() or change.changed_by_user.username
                    if change.changed_by_user
                    else None
                ),
                'changed_at': change.changed_at,
            }
            for change in changes
        ]

    def get_profile_picture_url(self, user):
        picture = user.driver_profile.profile_picture
        if not picture:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(picture.url) if request else picture.url

    def validate_display_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Name is required.')
        return value

    def validate_username(self, value):
        value = value.strip()
        if not re.fullmatch(r'[A-Za-z0-9._-]{3,30}', value):
            raise serializers.ValidationError(
                'Use 3 to 30 letters, numbers, periods, dashes, or underscores.'
            )
        users = get_user_model().objects.filter(username__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError('That username is already taken.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        users = get_user_model().objects.filter(email__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError('An account already uses that email address.')
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        driver_data = validated_data.pop('driver_profile', {})
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        for field, value in driver_data.items():
            setattr(instance.driver_profile, field, value)
        if driver_data:
            instance.driver_profile.save(update_fields=list(driver_data))
        return instance


class AdminUserCreateSerializer(serializers.Serializer):
    ROLE_CHOICES = ('driver', 'sponsor', 'admin')

    first_name = NameField()
    last_name = NameField()
    username = UsernameField()
    email = NormalizedEmailField(max_length=254)
    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    sponsor_org_id = serializers.PrimaryKeyRelatedField(
        queryset=SponsorCompany.objects.all(),
        source='sponsor_org',
        required=False,
        allow_null=True,
    )
    # Drivers may start in several organizations; sponsors use sponsor_org_id.
    sponsor_org_ids = serializers.PrimaryKeyRelatedField(
        queryset=SponsorCompany.objects.all(),
        source='sponsor_orgs',
        many=True,
        required=False,
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)

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

    def validate_username(self, value):
        value = value.strip()
        if get_user_model().objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('That username is already taken.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if get_user_model().objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account already uses that email address.')
        return value

    def validate_password(self, value):
        # Compared against the submitted username, email, and names, so every
        # password problem is reported together with the other field errors.
        return validate_new_password(value, unsaved_user_from(self.initial_data))

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        role = attrs['role']
        sponsor_org = attrs.get('sponsor_org')
        if role == 'sponsor' and sponsor_org is None:
            raise serializers.ValidationError(
                {'sponsor_org_id': 'Choose the organization this sponsor manages.'}
            )
        if role == 'admin' and sponsor_org is not None:
            raise serializers.ValidationError(
                {'sponsor_org_id': 'Administrator accounts cannot have a sponsor organization.'}
            )
        if role != 'driver' and attrs.get('sponsor_orgs'):
            raise serializers.ValidationError(
                {'sponsor_org_ids': 'Only drivers can belong to several organizations.'}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        role = validated_data.pop('role')
        sponsor_org = validated_data.pop('sponsor_org', None)
        sponsor_orgs = validated_data.pop('sponsor_orgs', [])
        password = validated_data.pop('password')
        validated_data.pop('password_confirm')
        is_admin = role == 'admin'
        user = get_user_model()(
            **validated_data,
            is_staff=is_admin,
            is_superuser=is_admin,
            is_active=True,
        )
        user.set_password(password)
        user.save()

        if role == 'driver':
            driver = Driver.objects.create(user=user, name=user.get_full_name())
            sponsors = {company.pk: company for company in [sponsor_org, *sponsor_orgs] if company}
            # Admin assignments are approved immediately and audited.
            admin_assign_sponsors(
                driver=driver,
                sponsors=list(sponsors.values()),
                changed_by_user=self.context['request'].user,
                # The new account's welcome email covers this; no separate notice.
                notify=False,
            )
        elif role == 'sponsor':
            SponsorAccount.objects.create(user=user, company=sponsor_org)
        return user
