import re
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from drivers.models import Driver

from .models import SponsorAccount, SponsorCompany
from .services import get_account_type


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


class AdminSponsorDetailSerializer(serializers.ModelSerializer):
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
    display_name = serializers.CharField(source='driver_profile.name')
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

    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    username = serializers.RegexField(
        r'^[A-Za-z0-9._-]+$',
        max_length=30,
        min_length=3,
        error_messages={
            'invalid': 'Use only letters, numbers, periods, dashes, or underscores.'
        },
    )
    email = serializers.EmailField(max_length=254)
    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    sponsor_org_id = serializers.PrimaryKeyRelatedField(
        queryset=SponsorCompany.objects.all(),
        source='sponsor_org',
        required=False,
        allow_null=True,
    )
    password = serializers.CharField(write_only=True)

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

    def validate(self, attrs):
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
    username = serializers.RegexField(
        r'^[A-Za-z0-9._-]+$',
        max_length=30,
        min_length=3,
        error_messages={
            'invalid': 'Use only letters, numbers, periods, dashes, or underscores.'
        },
    )
    name = serializers.CharField(max_length=200)
    account_type = serializers.SerializerMethodField()
    company = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    profile_picture = serializers.ImageField(
        required=False,
        allow_null=True,
        write_only=True,
    )
    remove_profile_picture = serializers.BooleanField(
        required=False,
        default=False,
        write_only=True,
    )
    mfa = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = (
            'id',
            'username',
            'name',
            'account_type',
            'company',
            'avatar_url',
            'profile_picture',
            'remove_profile_picture',
            'mfa',
        )
        read_only_fields = ('id', 'account_type', 'company', 'avatar_url', 'mfa')

    def get_account_type(self, user):
        return get_account_type(user)

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

    def get_avatar_url(self, user):
        if not hasattr(user, 'driver_profile'):
            return None
        picture = user.driver_profile.profile_picture
        if not picture:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(picture.url) if request else picture.url

    def validate_profile_picture(self, value):
        # Pillow-backed ImageField validation verifies that this is a real image.
        if Path(value.name).suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp'}:
            raise serializers.ValidationError('Choose a JPG, PNG, or WebP image.')
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError('Profile pictures must be 2 MB or smaller.')
        return value

    def validate(self, attrs):
        changing_picture = (
            'profile_picture' in attrs or attrs.get('remove_profile_picture', False)
        )
        if changing_picture and not hasattr(self.instance, 'driver_profile'):
            raise serializers.ValidationError({
                'profile_picture': 'Profile pictures are currently available to drivers only.'
            })
        if attrs.get('profile_picture') and attrs.get('remove_profile_picture'):
            raise serializers.ValidationError({
                'profile_picture': 'Choose a new picture or remove the current one, not both.'
            })
        return attrs

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
            'avatar_url': self.get_avatar_url(user),
            'mfa': self.get_mfa(user),
        }

    @transaction.atomic
    def update(self, user, validated_data):
        # Keep User and its role-specific profile consistent if either save fails
        name = validated_data.pop('name', None)
        picture = validated_data.pop('profile_picture', None)
        remove_picture = validated_data.pop('remove_profile_picture', False)
        user.username = validated_data.get('username', user.username)

        if hasattr(user, 'driver_profile'):
            driver = user.driver_profile
            changed_driver_fields = []
            if name is not None:
                driver.name = name
                changed_driver_fields.append('name')

            old_picture = driver.profile_picture
            old_picture_name = old_picture.name if old_picture else None
            old_storage = old_picture.storage if old_picture else None
            if remove_picture:
                driver.profile_picture = None
                changed_driver_fields.append('profile_picture')
            elif picture is not None:
                driver.profile_picture = picture
                changed_driver_fields.append('profile_picture')

            if changed_driver_fields:
                driver.save(update_fields=changed_driver_fields)

            # Delete a replaced file only after the database update commits.
            if old_picture_name and (remove_picture or picture is not None):
                transaction.on_commit(
                    lambda storage=old_storage, name=old_picture_name: storage.delete(name)
                )
        elif name is not None:
            # Non-driver display names are stored on Django's User record.
            user.first_name = name
            user.last_name = ''

        user.save()
        return user
