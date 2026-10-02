import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from drivers.models import Driver

from ..input_cleaning import (
    HumanTextField,
    NameField,
    NormalizedEmailField,
    UsernameField,
    validate_password_policy,
)
from ..models import SponsorAccount, SponsorCompany
from ..services import get_account_type


class AdminUserListSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    sponsor_org = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = (
            'id',
            'display_name',
            'username',
            'role',
            'sponsor_org',
            'is_active',
        )

    def get_display_name(self, user):
        if hasattr(user, 'driver_profile'):
            return user.driver_profile.name
        return user.get_full_name() or user.get_username()

    def get_role(self, user):
        return get_account_type(user)

    def get_sponsor_org(self, user):
        company = None
        if hasattr(user, 'driver_profile'):
            company = user.driver_profile.sponsor
        elif hasattr(user, 'sponsor_account'):
            company = user.sponsor_account.company
        if company is None:
            return None
        return {'id': company.id, 'name': company.name}


class SponsorCompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = SponsorCompany
        fields = ('id', 'name')


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
            'id', 'first_name', 'last_name', 'username', 'email', 'role',
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
            raise serializers.ValidationError(
                'An account already uses that email address.'
            )
        return value


class AdminSponsorDetailSerializer(serializers.ModelSerializer):
    first_name = NameField()
    last_name = NameField()
    username = UsernameField()
    email = NormalizedEmailField(max_length=254)
    role = serializers.SerializerMethodField()
    sponsor_org = serializers.SerializerMethodField()
    sponsor_org_id = serializers.PrimaryKeyRelatedField(
        queryset=SponsorCompany.objects.all(),
        source='sponsor_account.company',
        write_only=True,
    )

    class Meta:
        model = get_user_model()
        fields = (
            'id', 'first_name', 'last_name', 'username', 'email', 'role',
            'sponsor_org', 'sponsor_org_id', 'is_active',
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
            raise serializers.ValidationError(
                'An account already uses that email address.'
            )
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


class AdminDriverDetailSerializer(serializers.ModelSerializer):
    display_name = HumanTextField(source='driver_profile.name', max_length=200)
    username = UsernameField()
    email = NormalizedEmailField(max_length=254)
    role = serializers.SerializerMethodField()
    sponsor_org = serializers.SerializerMethodField()
    sponsor_org_id = serializers.PrimaryKeyRelatedField(
        queryset=SponsorCompany.objects.all(),
        source='driver_profile.sponsor',
        write_only=True,
        required=False,
        allow_null=True,
    )
    profile_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = (
            'id', 'display_name', 'username', 'email', 'role', 'sponsor_org',
            'sponsor_org_id', 'is_active', 'profile_picture_url',
        )
        read_only_fields = ('id', 'role', 'sponsor_org', 'profile_picture_url')

    def get_role(self, user):
        return 'driver'

    def get_sponsor_org(self, user):
        company = user.driver_profile.sponsor
        return {'id': company.id, 'name': company.name} if company else None

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
            raise serializers.ValidationError(
                'An account already uses that email address.'
            )
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
            raise serializers.ValidationError(
                'An account already uses that email address.'
            )
        return value

    def validate_password(self, value):
        return validate_password_policy(value)

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        validate_password_policy(
            attrs['password'],
            username=attrs['username'],
            email=attrs['email'],
        )
        role = attrs['role']
        sponsor_org = attrs.get('sponsor_org')
        if role == 'sponsor' and sponsor_org is None:
            raise serializers.ValidationError({
                'sponsor_org_id': 'Choose the organization this sponsor manages.'
            })
        if role == 'admin' and sponsor_org is not None:
            raise serializers.ValidationError({
                'sponsor_org_id': 'Administrator accounts cannot have a sponsor organization.'
            })

        proposed_user = get_user_model()(
            username=attrs['username'],
            first_name=attrs['first_name'],
            last_name=attrs['last_name'],
            email=attrs['email'],
        )
        try:
            django_validate_password(attrs['password'], proposed_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        role = validated_data.pop('role')
        sponsor_org = validated_data.pop('sponsor_org', None)
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
            Driver.objects.create(
                user=user,
                name=user.get_full_name(),
                sponsor=sponsor_org,
            )
        elif role == 'sponsor':
            SponsorAccount.objects.create(user=user, company=sponsor_org)
        return user
