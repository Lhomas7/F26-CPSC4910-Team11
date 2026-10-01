from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from ..input_cleaning import (
    HumanTextField,
    NormalizedEmailField,
    UsernameField,
    validate_password_policy,
)
from ..services import get_account_type, get_mfa_status


class ChangePasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_password(self, value):
        return validate_password_policy(value)

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
        user = self.context.get('user')
        # Prevent attempts to reset a password to its current value.
        if user is not None and user.check_password(attrs['password']):
            raise serializers.ValidationError(
                {'password': 'Choose a different password than your current one.'}
            )

        validate_password_policy(
            attrs['password'],
            username=user.username if user else '',
            email=user.email if user else '',
        )
        if user is not None:
            try:
                django_validate_password(attrs['password'], user)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'password': list(exc.messages)})
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = NormalizedEmailField(max_length=254)


class SelfProfileSerializer(serializers.ModelSerializer):
    # Profile data spans Django's User model and the role-specific related model.
    username = UsernameField()
    name = HumanTextField(max_length=200)
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

        # Treat differently cased usernames as duplicates to avoid ambiguous logins.
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
        # Driver names live on Driver; sponsor names currently live on User.
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
        # Keep User and its role-specific profile consistent if either save fails.
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
