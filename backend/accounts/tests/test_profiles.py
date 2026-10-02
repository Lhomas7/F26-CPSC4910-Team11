import logging
import re
from contextlib import contextmanager
from datetime import timedelta
from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pyotp

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import (
    AdminImpersonationEvent,
    DriverNotification,
    LoginAttempt,
    MFABackupCode,
    MFACode,
    MFASettings,
    SponsorAccount,
    SponsorCompany,
)
from ..middleware import IMPERSONATION_STARTED_KEY
from ..services.crypto import decrypt_secret, encrypt_secret
from ..services.mfa import backup_codes_remaining, create_mfa_code

class SelfProfileTests(APITestCase):
    url = reverse('accounts:self-profile')

    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )
        cls.other_user = get_user_model().objects.create_user(
            username='driver.two',
            password='ExamplePassword123!',
        )
        cls.other_driver = Driver.objects.create(
            user=cls.other_user,
            name='Driver Two',
            status='approved',
        )

    def setUp(self):
        self.media_directory = TemporaryDirectory()
        self.media_override = override_settings(MEDIA_ROOT=self.media_directory.name)
        self.media_override.enable()

    def tearDown(self):
        self.media_override.disable()
        self.media_directory.cleanup()

    def image_upload(self, name='profile.png'):
        image_bytes = BytesIO()
        Image.new('RGB', (40, 40), color='#3fae86').save(image_bytes, format='PNG')
        return SimpleUploadedFile(
            name,
            image_bytes.getvalue(),
            content_type='image/png',
        )

    def large_image_upload(self):
        image_bytes = BytesIO()
        # An uncompressed image reliably exceeds the limit without a huge fixture.
        Image.new('RGB', (900, 900), color='#3fae86').save(image_bytes, format='BMP')
        return SimpleUploadedFile(
            'too-large.png',
            image_bytes.getvalue(),
            content_type='image/png',
        )

    def test_requires_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_returns_logged_in_drivers_profile(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                'id': self.user.id,
                'username': 'driver.one',
                'name': 'Driver One',
                'account_type': 'driver',
                'company': 'Palmetto Freight',
                'avatar_url': None,
                'mfa': {
                    'required': False,
                    'enrolled': False,
                    'methods': [],
                    'default_method': 'email',
                    'allowed_methods': ['email', 'sms', 'totp'],
                    'backup_codes_remaining': 0,
                },
            },
        )

    def test_updates_only_logged_in_drivers_editable_fields(self):
        self.client.force_authenticate(self.user)

        # Attempts to redirect the update or change read-only fields are ignored.
        response = self.client.patch(
            self.url,
            {
                'username': 'updated.driver',
                'name': 'Updated Driver',
                'account_type': 'sponsor',
                'company': 'Changed Company',
                'id': self.other_user.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.driver.refresh_from_db()
        self.other_user.refresh_from_db()
        self.other_driver.refresh_from_db()
        self.assertEqual(self.user.username, 'updated.driver')
        self.assertEqual(self.driver.name, 'Updated Driver')
        self.assertEqual(self.driver.sponsor, self.sponsor)
        self.assertEqual(self.other_user.username, 'driver.two')
        self.assertEqual(self.other_driver.name, 'Driver Two')

    def test_driver_cannot_select_another_profile_with_query_or_body_ids(self):
        self.client.force_authenticate(self.user)

        get_response = self.client.get(self.url, {'user_id': self.other_user.id})
        patch_response = self.client.patch(
            f'{self.url}?user_id={self.other_user.id}',
            {
                'id': self.other_user.id,
                'user_id': self.other_user.id,
                'name': 'Still Driver One',
            },
            format='json',
        )

        self.assertEqual(get_response.data['id'], self.user.id)
        self.assertEqual(patch_response.data['id'], self.user.id)
        self.other_driver.refresh_from_db()
        self.assertEqual(self.other_driver.name, 'Driver Two')

    def test_rejects_username_outside_the_shared_account_rules(self):
        self.client.force_authenticate(self.user)

        invalid_characters = self.client.patch(
            self.url, {'username': 'driver one'}, format='json'
        )
        too_short = self.client.patch(
            self.url, {'username': 'ab'}, format='json'
        )

        self.assertEqual(invalid_characters.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', invalid_characters.data)
        self.assertEqual(too_short.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', too_short.data)

    def test_rejects_duplicate_username_case_insensitively(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {'username': 'DRIVER.TWO'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['username'][0],
            'A user with this username already exists.',
        )

    def test_uploads_verified_picture_with_randomized_filename(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {'profile_picture': self.image_upload('My Vacation Photo.png')},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.driver.refresh_from_db()
        self.assertTrue(self.driver.profile_picture.name.startswith(
            f'driver_profiles/{self.driver.pk}/'
        ))
        self.assertNotIn('My Vacation Photo', self.driver.profile_picture.name)
        self.assertTrue(Path(self.driver.profile_picture.path).exists())
        self.assertIn('/media/driver_profiles/', response.data['avatar_url'])

    def test_rejects_a_file_that_is_not_an_image(self):
        self.client.force_authenticate(self.user)
        fake_picture = SimpleUploadedFile(
            'profile.png',
            b'this is not an image',
            content_type='image/png',
        )

        response = self.client.patch(
            self.url,
            {'profile_picture': fake_picture},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('profile_picture', response.data)

    def test_rejects_an_unsupported_image_extension(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {'profile_picture': self.image_upload('profile.gif')},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['profile_picture'][0],
            'Choose a JPG, PNG, or WebP image.',
        )

    def test_rejects_a_picture_larger_than_two_megabytes(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {'profile_picture': self.large_image_upload()},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['profile_picture'][0],
            'Profile pictures must be 2 MB or smaller.',
        )

    def test_removes_picture_and_deletes_stored_file_after_commit(self):
        self.driver.profile_picture.save('original.png', self.image_upload(), save=True)
        original_path = Path(self.driver.profile_picture.path)
        self.client.force_authenticate(self.user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                self.url,
                {'remove_profile_picture': True},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.driver.refresh_from_db()
        self.assertFalse(self.driver.profile_picture)
        self.assertFalse(original_path.exists())
        self.assertIsNone(response.data['avatar_url'])


class AdminSelfProfileTests(APITestCase):
    profile_url = reverse('accounts:self-profile')
    login_url = reverse('accounts:login')
    me_url = reverse('accounts:me')

    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(
            username='team11.admin',
            email='admin@example.com',
            password='ExamplePassword123!',
            first_name='Team',
            last_name='Administrator',
        )

    def test_admin_can_log_in_and_is_returned_as_an_admin(self):
        response = self.client.post(
            self.login_url,
            {'username': 'team11.admin', 'password': 'ExamplePassword123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['account_type'], 'admin')
        self.assertEqual(response.data['name'], 'Team Administrator')
        self.assertIsNone(response.data['company'])

        me_response = self.client.get(self.me_url)
        self.assertTrue(me_response.data['authenticated'])
        self.assertEqual(me_response.data['user']['account_type'], 'admin')

    def test_admin_can_get_and_update_their_own_profile(self):
        self.client.force_authenticate(self.admin)

        get_response = self.client.get(self.profile_url)
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data, {
            'id': self.admin.id,
            'username': 'team11.admin',
            'name': 'Team Administrator',
            'account_type': 'admin',
            'company': None,
            'avatar_url': None,
            'mfa': {
                'required': True,
                'enrolled': False,
                'methods': [],
                'default_method': 'totp',
                'allowed_methods': ['totp'],
                'backup_codes_remaining': 0,
            },
        })

        patch_response = self.client.patch(
            self.profile_url,
            {'name': 'Program Administrator', 'username': 'program.admin'},
            format='json',
        )

        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.username, 'program.admin')
        self.assertEqual(self.admin.get_full_name(), 'Program Administrator')
        self.assertEqual(patch_response.data['account_type'], 'admin')

    def test_admin_cannot_add_a_driver_profile_picture(self):
        self.client.force_authenticate(self.admin)
        image_bytes = BytesIO()
        Image.new('RGB', (40, 40), color='#3fae86').save(image_bytes, format='PNG')
        picture = SimpleUploadedFile(
            'profile.png',
            image_bytes.getvalue(),
            content_type='image/png',
        )

        response = self.client.patch(
            self.profile_url,
            {'profile_picture': picture},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('profile_picture', response.data)

