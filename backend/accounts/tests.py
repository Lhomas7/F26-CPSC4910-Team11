import logging
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

from .models import (
    DriverNotification,
    MFACode,
    MFASettings,
    SponsorAccount,
    SponsorCompany,
)
from .services.crypto import decrypt_secret, encrypt_secret


class MailAssertMixin:
    @contextmanager
    def assertSendsMail(self, count):
        with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            mail.outbox = []
            yield
            self.assertEqual(len(mail.outbox), count)


class RegistrationTests(APITestCase):
    driver_url = reverse('accounts:driver-register')
    sponsor_url = reverse('accounts:sponsor-register')

    def registration_data(self, **overrides):
        data = {
            'first_name': 'Jamie',
            'last_name': 'Rivera',
            'email': 'jamie@example.com',
            'username': 'jamie.rivera',
            'password': 'ExamplePassword123!',
        }
        data.update(overrides)
        return data

    def test_driver_registration_stores_name_and_email(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='jamie.rivera')
        self.assertEqual(user.first_name, 'Jamie')
        self.assertEqual(user.last_name, 'Rivera')
        self.assertEqual(user.email, 'jamie@example.com')
        self.assertEqual(user.driver_profile.name, 'Jamie Rivera')

    def test_sponsor_registration_stores_name_email_and_company(self):
        data = self.registration_data(
            username='sponsor.user',
            email='sponsor@example.com',
            company_name='Palmetto Freight',
        )

        response = self.client.post(self.sponsor_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='sponsor.user')
        self.assertEqual(user.get_full_name(), 'Jamie Rivera')
        self.assertEqual(user.email, 'sponsor@example.com')
        self.assertEqual(user.sponsor_account.company.name, 'Palmetto Freight')

    def test_sponsor_registration_establishes_authenticated_session(self):
        data = self.registration_data(
            username='sponsor.user',
            email='sponsor@example.com',
            company_name='Palmetto Freight',
        )

        response = self.client.post(self.sponsor_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('mfa', response.data)
        self.assertEqual(response.data['mfa']['enrolled'], False)

        me = self.client.get(reverse('accounts:me'))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['authenticated'], True)
        self.assertEqual(me.data['user']['account_type'], 'sponsor')

    def test_registration_rejects_duplicate_email_case_insensitively(self):
        get_user_model().objects.create_user(
            username='existing.user',
            email='jamie@example.com',
        )

        response = self.client.post(
            self.driver_url,
            self.registration_data(email='JAMIE@EXAMPLE.COM'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['email'][0],
            'A user with this email address already exists.',
        )

    def test_registration_requires_each_name_and_email_field(self):
        for field in ('first_name', 'last_name', 'email'):
            data = self.registration_data()
            del data[field]

            response = self.client.post(self.driver_url, data, format='json')

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(field, response.data)


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
                'mfa': {'required': False, 'enrolled': False, 'methods': []},
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
            'mfa': {'required': False, 'enrolled': False, 'methods': []},
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


class AdminUserListTests(APITestCase):
    url = reverse('accounts:admin-user-list')

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.admin = get_user_model().objects.create_superuser(
            username='directory.admin',
            password='ExamplePassword123!',
            first_name='Directory',
            last_name='Admin',
        )
        cls.driver_user = get_user_model().objects.create_user(
            username='marcus.driver',
            password='ExamplePassword123!',
        )
        Driver.objects.create(
            user=cls.driver_user,
            name='Marcus Alvarez',
            sponsor=cls.company,
            status='approved',
        )
        cls.sponsor_user = get_user_model().objects.create_user(
            username='dana.sponsor',
            password='ExamplePassword123!',
            first_name='Dana',
            last_name='Whitfield',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.orphan = get_user_model().objects.create_user(username='orphan.user')

    def test_only_admins_can_list_users(self):
        anonymous_response = self.client.get(self.url)
        self.client.force_authenticate(self.driver_user)
        driver_response = self.client.get(self.url)

        self.assertEqual(anonymous_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(driver_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_returns_each_application_role_and_excludes_orphans(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([user['display_name'] for user in response.data], [
            'Dana Whitfield', 'Directory Admin', 'Marcus Alvarez'
        ])
        driver = next(user for user in response.data if user['role'] == 'driver')
        self.assertEqual(driver['display_name'], 'Marcus Alvarez')
        self.assertEqual(driver['sponsor_org']['name'], 'Palmetto Freight')
        self.assertNotIn('orphan.user', [user['username'] for user in response.data])

    def test_filters_by_role_and_searches_name_or_username(self):
        self.client.force_authenticate(self.admin)

        role_response = self.client.get(self.url, {'role': 'sponsor'})
        search_response = self.client.get(self.url, {'search': 'marcus'})

        self.assertEqual([user['username'] for user in role_response.data], [
            'dana.sponsor'
        ])
        self.assertEqual([user['username'] for user in search_response.data], [
            'marcus.driver'
        ])

    def test_rejects_an_unknown_role_filter(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url, {'role': 'owner'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)


class AdminUserCreationTests(APITestCase):
    user_url = reverse('accounts:admin-user-list')
    company_url = reverse('accounts:admin-sponsor-company-list')

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.admin = get_user_model().objects.create_superuser(
            username='creator.admin',
            password='ExamplePassword123!',
        )
        cls.driver_user = get_user_model().objects.create_user(
            username='ordinary.driver',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=cls.driver_user, name='Ordinary Driver')

    def payload(self, **overrides):
        data = {
            'first_name': 'Jamie',
            'last_name': 'Rivera',
            'username': 'jamie.rivera',
            'email': 'jamie@example.com',
            'role': 'driver',
            'sponsor_org_id': self.company.id,
            'password': 'ExamplePassword123!',
        }
        data.update(overrides)
        return data

    def test_only_admins_can_load_companies_or_create_users(self):
        self.client.force_authenticate(self.driver_user)

        company_response = self.client.get(self.company_url)
        create_response = self.client.post(
            self.user_url,
            self.payload(),
            format='json',
        )

        self.assertEqual(company_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_lists_sponsor_companies_alphabetically(self):
        SponsorCompany.objects.create(name='Blue Ridge Logistics')
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.company_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([company['name'] for company in response.data], [
            'Blue Ridge Logistics', 'Palmetto Freight'
        ])

    def test_creates_driver_with_optional_sponsor(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(self.user_url, self.payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='jamie.rivera')
        self.assertEqual(user.driver_profile.name, 'Jamie Rivera')
        self.assertEqual(user.driver_profile.sponsor, self.company)
        self.assertEqual(response.data['role'], 'driver')

    def test_creates_sponsor_with_required_organization(self):
        self.client.force_authenticate(self.admin)
        data = self.payload(
            username='sponsor.user',
            email='sponsor@example.com',
            role='sponsor',
        )

        response = self.client.post(self.user_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='sponsor.user')
        self.assertEqual(user.sponsor_account.company, self.company)
        self.assertEqual(response.data['sponsor_org']['name'], 'Palmetto Freight')

    def test_creates_staff_superuser_for_admin_role(self):
        self.client.force_authenticate(self.admin)
        data = self.payload(
            username='new.admin',
            email='new.admin@example.com',
            role='admin',
            sponsor_org_id=None,
        )

        response = self.client.post(self.user_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='new.admin')
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(response.data['role'], 'admin')

    def test_rejects_duplicate_username_and_email_case_insensitively(self):
        get_user_model().objects.create_user(
            username='existing.user',
            email='existing@example.com',
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            self.user_url,
            self.payload(
                username='EXISTING.USER',
                email='EXISTING@EXAMPLE.COM',
            ),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)

    def test_requires_an_organization_for_sponsor_accounts(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            self.user_url,
            self.payload(
                username='sponsor.without.org',
                email='sponsor.without.org@example.com',
                role='sponsor',
                sponsor_org_id=None,
            ),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sponsor_org_id', response.data)


class AdminSponsorDetailTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other_company = SponsorCompany.objects.create(name='Blue Ridge Logistics')
        cls.admin = get_user_model().objects.create_superuser(
            username='sponsor.manager', password='ExamplePassword123!'
        )
        cls.sponsor_user = get_user_model().objects.create_user(
            username='dana.sponsor',
            password='ExamplePassword123!',
            first_name='Dana',
            last_name='Whitfield',
            email='dana@example.com',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.driver_user = get_user_model().objects.create_user(
            username='ordinary.driver', password='ExamplePassword123!'
        )
        Driver.objects.create(user=cls.driver_user, name='Ordinary Driver')

    def detail_url(self, user=None):
        return reverse(
            'accounts:admin-sponsor-detail',
            kwargs={'user_id': (user or self.sponsor_user).id},
        )

    def test_admin_can_load_sponsor_details(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'sponsor')
        self.assertEqual(response.data['sponsor_org']['name'], 'Palmetto Freight')
        self.assertEqual(response.data['email'], 'dana@example.com')

    def test_non_admin_cannot_view_or_edit_sponsor(self):
        self.client.force_authenticate(self.driver_user)

        get_response = self.client.get(self.detail_url())
        patch_response = self.client.patch(
            self.detail_url(), {'first_name': 'Changed'}, format='json'
        )

        self.assertEqual(get_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_driver_id_is_not_exposed_as_a_sponsor_detail(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url(self.driver_user))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_update_sponsor_identity_company_and_status(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'first_name': 'Danielle',
            'last_name': 'Whitfield',
            'username': 'danielle.sponsor',
            'email': 'danielle@example.com',
            'sponsor_org_id': self.other_company.id,
            'is_active': False,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.sponsor_user.refresh_from_db()
        self.sponsor_user.sponsor_account.refresh_from_db()
        self.assertEqual(self.sponsor_user.first_name, 'Danielle')
        self.assertEqual(self.sponsor_user.sponsor_account.company, self.other_company)
        self.assertFalse(self.sponsor_user.is_active)

    def test_rejects_duplicate_username_and_email(self):
        get_user_model().objects.create_user(
            username='existing.user', email='existing@example.com'
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'username': 'EXISTING.USER',
            'email': 'EXISTING@EXAMPLE.COM',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)


class AdminDriverDetailTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other_company = SponsorCompany.objects.create(name='Blue Ridge Logistics')
        cls.admin = get_user_model().objects.create_superuser(
            username='driver.manager', password='ExamplePassword123!'
        )
        cls.driver_user = get_user_model().objects.create_user(
            username='tasha.driver',
            password='ExamplePassword123!',
            email='tasha@example.com',
        )
        Driver.objects.create(
            user=cls.driver_user,
            name='Tasha Greene',
            sponsor=cls.company,
            status='approved',
        )
        cls.sponsor_user = get_user_model().objects.create_user(
            username='ordinary.sponsor', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)

    def detail_url(self, user=None):
        return reverse(
            'accounts:admin-driver-detail',
            kwargs={'user_id': (user or self.driver_user).id},
        )

    def test_admin_can_load_driver_details(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['display_name'], 'Tasha Greene')
        self.assertEqual(response.data['role'], 'driver')
        self.assertEqual(response.data['sponsor_org']['name'], 'Palmetto Freight')
        self.assertIsNone(response.data['profile_picture_url'])

    def test_non_admin_cannot_view_or_edit_driver(self):
        self.client.force_authenticate(self.sponsor_user)

        get_response = self.client.get(self.detail_url())
        patch_response = self.client.patch(
            self.detail_url(), {'display_name': 'Changed'}, format='json'
        )

        self.assertEqual(get_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sponsor_id_is_not_exposed_as_driver_detail(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url(self.sponsor_user))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_update_driver_and_remove_sponsor(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'display_name': 'Tasha Green',
            'username': 'tasha.green',
            'email': 'tasha.green@example.com',
            'sponsor_org_id': None,
            'is_active': False,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.driver_user.refresh_from_db()
        self.driver_user.driver_profile.refresh_from_db()
        self.assertEqual(self.driver_user.driver_profile.name, 'Tasha Green')
        self.assertIsNone(self.driver_user.driver_profile.sponsor)
        self.assertFalse(self.driver_user.is_active)

    def test_admin_can_reassign_driver_to_another_sponsor(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.detail_url(),
            {'sponsor_org_id': self.other_company.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sponsor_org']['name'], 'Blue Ridge Logistics')

    def test_rejects_invalid_or_duplicate_identity_fields(self):
        get_user_model().objects.create_user(
            username='existing.user', email='existing@example.com'
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'display_name': '   ',
            'username': 'EXISTING.USER',
            'email': 'EXISTING@EXAMPLE.COM',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('display_name', response.data)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)

class MFAEnrollmentTests(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.user)

    @patch('accounts.services.delivery.send_email_code')
    def test_email_method_stays_disabled_until_correct_enroll_code(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        response = self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'enroll', 'method': 'email'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        raw_code = mock_send_email.call_args[0][1]

        mfa, _ = MFASettings.objects.get_or_create(user=self.user)
        self.assertFalse(mfa.email_enabled)

        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': '000000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mfa.refresh_from_db()
        self.assertFalse(mfa.email_enabled)

        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': raw_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mfa.refresh_from_db()
        self.assertTrue(mfa.email_enabled)

    def test_enroll_purpose_code_cannot_satisfy_a_login_challenge(self):
        MFACode.objects.create(
            user=self.user,
            purpose='login',
            method='email',
            code_hash=make_password('123456'),
            expires_at=timezone.now() + timedelta(minutes=5),
        )

        # MFAVerifyView only accepts enroll-purpose codes, so a login code is rejected.
        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_totp_verify_before_enable(self):
        secret = pyotp.random_base32()
        mfa, _ = MFASettings.objects.get_or_create(user=self.user)
        mfa.totp_secret_encrypted = encrypt_secret(secret)
        mfa.save(update_fields=['totp_secret_encrypted'])
        self.assertFalse(mfa.totp_enabled)

        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'totp', 'code': '000000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mfa.refresh_from_db()
        self.assertFalse(mfa.totp_enabled)

        code = pyotp.TOTP(secret).now()
        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'totp', 'code': code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mfa.refresh_from_db()
        self.assertTrue(mfa.totp_enabled)


class MFALoginTests(APITestCase):
    login_url = reverse('accounts:login')
    mfa_login_url = reverse('accounts:login-mfa')

    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

    def setUp(self):
        cache.clear()
        self.mfa, _ = MFASettings.objects.get_or_create(user=self.user)

    def login(self):
        return self.client.post(
            self.login_url,
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )

    def test_login_without_mfa_logs_in_directly(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('id', response.data)
        self.assertEqual(response.data['mfa']['enrolled'], False)
        self.assertEqual(response.data['mfa']['methods'], [])

    def test_login_with_mfa_returns_challenge_and_creates_no_session(self):
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {'mfa': {'required': False, 'enrolled': True, 'methods': ['email']}},
        )

        me = self.client.get(reverse('accounts:me'))
        self.assertEqual(me.data, {'authenticated': False})

    @patch('accounts.services.delivery.send_email_code')
    def test_login_mfa_correct_code_logs_in(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        self.login()
        self.client.post(
            reverse('accounts:login-mfa-request-code'),
            {'method': 'email'},
            format='json',
        )
        raw_code = mock_send_email.call_args[0][1]

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': raw_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('id', response.data)
        self.assertEqual(response.data['username'], 'driver.one')

    @patch('accounts.services.delivery.send_email_code')
    def test_wrong_code_increments_attempts_and_sixth_rejected(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        self.login()
        self.client.post(
            reverse('accounts:login-mfa-request-code'),
            {'method': 'email'},
            format='json',
        )
        raw_code = mock_send_email.call_args[0][1]

        for _ in range(5):
            response = self.client.post(
                self.mfa_login_url,
                {'method': 'email', 'code': '000000'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': raw_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch('accounts.services.delivery.send_sms_code')
    @patch('accounts.services.delivery.send_email_code')
    def test_login_with_mfa_sends_no_codes(self, mock_send_email, mock_send_sms):
        mock_send_email.side_effect = lambda user, code: None
        mock_send_sms.side_effect = lambda phone, code: None
        self.mfa.email_enabled = True
        self.mfa.sms_enabled = True
        self.mfa.phone_number = '+18645551234'
        self.mfa.save(update_fields=['email_enabled', 'sms_enabled', 'phone_number'])

        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        mock_send_email.assert_not_called()
        mock_send_sms.assert_not_called()

    def test_expired_pending_session_is_rejected(self):
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        self.login()
        session = self.client.session
        session['pending_mfa_expires'] = (timezone.now() - timedelta(seconds=1)).isoformat()
        session.save()

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_mfa_without_pending_session_rejected(self):
        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginMFARequestCodeTests(APITestCase):
    url = reverse('accounts:login-mfa-request-code')

    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

    def setUp(self):
        cache.clear()
        self.mfa, _ = MFASettings.objects.get_or_create(user=self.user)

    def login(self):
        return self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )

    def test_rejected_without_pending_session(self):
        response = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejected_for_method_that_is_not_enabled(self):
        self.mfa.sms_enabled = True
        self.mfa.save(update_fields=['sms_enabled'])
        self.login()

        response = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sms_rejected_without_a_phone_number(self):
        self.mfa.sms_enabled = True
        self.mfa.save(update_fields=['sms_enabled'])
        self.login()

        response = self.client.post(self.url, {'method': 'sms'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_totp_rejected_by_serializer(self):
        self.login()

        response = self.client.post(self.url, {'method': 'totp'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('accounts.services.delivery.send_sms_code')
    @patch('accounts.services.delivery.send_email_code')
    def test_only_selected_method_is_delivered(self, mock_send_email, mock_send_sms):
        mock_send_email.side_effect = lambda user, code: None
        mock_send_sms.side_effect = lambda phone, code: None
        self.mfa.email_enabled = True
        self.mfa.sms_enabled = True
        self.mfa.phone_number = '+18645551234'
        self.mfa.save(update_fields=['email_enabled', 'sms_enabled', 'phone_number'])
        self.login()

        self.client.post(self.url, {'method': 'email'}, format='json')
        mock_send_email.assert_called_once()
        mock_send_sms.assert_not_called()

        cache.clear()
        mock_send_email.reset_mock()
        self.client.post(self.url, {'method': 'sms'}, format='json')
        mock_send_sms.assert_called_once_with('+18645551234', mock_send_sms.call_args[0][1])
        mock_send_email.assert_not_called()

    @patch('accounts.services.delivery.send_email_code')
    def test_rejected_on_second_call_within_30_seconds(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])
        self.login()

        first = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class MFAResetTests(APITestCase):

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        self.mfa = MFASettings.objects.create(user=self.user)
        self.client.force_authenticate(self.user)
        cache.clear()

    def test_reset_fails_without_valid_fallback_code(self):
        self.mfa.totp_enabled = True
        self.mfa.email_enabled = True
        self.mfa.totp_secret_encrypted = encrypt_secret(pyotp.random_base32())
        self.mfa.save()

        response = self.client.post(
            reverse('accounts:mfa-reset'),
            {'fallback_method': 'email', 'fallback_code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('accounts.services.delivery.send_email_code')
    def test_reset_succeeds_and_rotates_secret(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        original_secret = pyotp.random_base32()
        self.mfa.totp_enabled = True
        self.mfa.email_enabled = True
        self.mfa.totp_secret_encrypted = encrypt_secret(original_secret)
        self.mfa.save()

        self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'reset', 'method': 'email'},
            format='json',
        )
        fallback_code = mock_send_email.call_args[0][1]

        response = self.client.post(
            reverse('accounts:mfa-reset'),
            {'fallback_method': 'email', 'fallback_code': fallback_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('qr_code', response.data)
        self.assertIn('manual_key', response.data)

        self.mfa.refresh_from_db()
        new_secret = decrypt_secret(self.mfa.totp_secret_encrypted)
        self.assertNotEqual(original_secret, new_secret)


class MFADisableTests(APITestCase):

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
        )
        self.mfa = MFASettings.objects.create(user=self.user, email_enabled=True)
        self.client.force_authenticate(self.user)
        cache.clear()

    def test_disable_fails_without_correct_password(self):
        response = self.client.post(
            reverse('accounts:mfa-disable'),
            {'method': 'email', 'password': 'wrongpassword!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.mfa.refresh_from_db()
        self.assertTrue(self.mfa.email_enabled)

    def test_disable_succeeds_with_correct_password(self):
        response = self.client.post(
            reverse('accounts:mfa-disable'),
            {'method': 'email', 'password': 'ExamplePassword123!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mfa.refresh_from_db()
        self.assertFalse(self.mfa.email_enabled)


class SponsorMFATests(MailAssertMixin, APITestCase):
    url = reverse('accounts:sponsor-mfa-settings')

    @classmethod
    def setUpTestData(cls):
        cls.sponsor_user = get_user_model().objects.create_user(
            username='sponsor.one',
            password='ExamplePassword123!',
        )
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.sponsor)

        cls.driver_user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver1@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

        cls.other_sponsor_user = get_user_model().objects.create_user(
            username='sponsor.two',
            password='ExamplePassword123!',
        )
        cls.other_sponsor = SponsorCompany.objects.create(name='Other Co')
        SponsorAccount.objects.create(user=cls.other_sponsor_user, company=cls.other_sponsor)

        cls.other_driver_user = get_user_model().objects.create_user(
            username='driver.two',
            password='ExamplePassword123!',
            email='driver2@example.com',
        )
        cls.other_driver = Driver.objects.create(
            user=cls.other_driver_user,
            name='Driver Two',
            sponsor=cls.other_sponsor,
            status='approved',
        )

    def setUp(self):
        self.client.force_authenticate(self.sponsor_user)
        cache.clear()

    def test_toggle_notifies_own_company_drivers_only(self):
        with self.assertSendsMail(1):
            response = self.client.post(self.url, {'driver_mfa_required': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'driver_mfa_required': True})

        self.assertTrue(
            DriverNotification.objects.filter(driver=self.driver).exists()
        )
        self.assertFalse(
            DriverNotification.objects.filter(driver=self.other_driver).exists()
        )

    def test_toggle_off_also_notifies_drivers(self):
        self.sponsor.driver_mfa_required = True
        self.sponsor.save(update_fields=['driver_mfa_required'])

        with self.assertSendsMail(1):
            response = self.client.post(self.url, {'driver_mfa_required': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            DriverNotification.objects.filter(driver=self.driver).exists()
        )
        self.assertFalse(
            DriverNotification.objects.filter(driver=self.other_driver).exists()
        )

    def test_get_returns_current_setting_for_sponsor(self):
        self.sponsor.driver_mfa_required = True
        self.sponsor.save(update_fields=['driver_mfa_required'])

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'driver_mfa_required': True})

    def test_get_rejected_for_non_sponsor(self):
        self.client.force_authenticate(self.driver_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_sponsor_rejected(self):
        self.client.force_authenticate(self.driver_user)
        response = self.client.post(self.url, {'driver_mfa_required': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MFANotificationTests(MailAssertMixin, APITestCase):

    def setUp(self):
        self.sponsor = SponsorCompany.objects.create(name='Acme Co')
        self.driver_user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        self.driver = Driver.objects.create(
            user=self.driver_user,
            name='Driver One',
            sponsor=self.sponsor,
            status='approved',
        )
        cache.clear()

    def enable_email(self):
        with patch('accounts.services.delivery.send_email_code') as mock_send_email:
            mock_send_email.side_effect = lambda user, code: None
            self.client.post(
                reverse('accounts:mfa-request-code'),
                {'purpose': 'enroll', 'method': 'email'},
                format='json',
            )
            raw_code = mock_send_email.call_args[0][1]
        self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': raw_code},
            format='json',
        )

    def test_driver_enabling_method_creates_notification_and_email(self):
        self.client.force_authenticate(self.driver_user)

        with self.assertSendsMail(1):
            self.enable_email()

        self.assertTrue(
            DriverNotification.objects.filter(driver=self.driver).exists()
        )
        self.assertEqual(mail.outbox[0].to, ['driver@example.com'])

    def test_driver_disabling_method_creates_notification_and_email(self):
        self.client.force_authenticate(self.driver_user)

        with self.assertSendsMail(1):
            self.enable_email()
        self.assertEqual(DriverNotification.objects.count(), 1)

        with self.assertSendsMail(1):
            response = self.client.post(
                reverse('accounts:mfa-disable'),
                {'method': 'email', 'password': 'ExamplePassword123!'},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(DriverNotification.objects.count(), 2)

    def test_sponsor_enabling_method_creates_no_driver_notification(self):
        sponsor_user = get_user_model().objects.create_user(
            username='sponsor.one',
            password='ExamplePassword123!',
            email='sponsor@example.com',
        )
        SponsorAccount.objects.create(user=sponsor_user, company=self.sponsor)
        self.client.force_authenticate(sponsor_user)

        with patch('accounts.services.delivery.send_email_code') as mock_send_email:
            mock_send_email.side_effect = lambda user, code: None
            self.client.post(
                reverse('accounts:mfa-request-code'),
                {'purpose': 'enroll', 'method': 'email'},
                format='json',
            )
            raw_code = mock_send_email.call_args[0][1]

        with self.assertSendsMail(0):
            response = self.client.post(
                reverse('accounts:mfa-verify'),
                {'method': 'email', 'code': raw_code},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            DriverNotification.objects.filter(driver=self.driver).exists()
        )


class MFARequestCodeThrottleTests(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.user)

    @patch('accounts.services.delivery.send_email_code')
    def test_rejected_on_second_call_within_30_seconds(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        request_data = {'purpose': 'enroll', 'method': 'email'}

        first = self.client.post(
            reverse('accounts:mfa-request-code'),
            request_data,
            format='json',
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(
            reverse('accounts:mfa-request-code'),
            request_data,
            format='json',
        )
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class SMSConsoleFallbackTests(APITestCase):

    def test_sms_logs_instead_of_raising_without_twilio(self):
        from .services.delivery import send_sms_code

        logger = logging.getLogger('accounts.services.sms')
        logger.setLevel(logging.INFO)
        buffer = StringIO()
        handler = logging.StreamHandler(buffer)
        logger.addHandler(handler)
        try:
            send_sms_code('+18645551234', '123456')
        finally:
            logger.removeHandler(handler)

        output = buffer.getvalue()
        self.assertIn('console fallback', output)
        self.assertIn('+18645551234', output)
