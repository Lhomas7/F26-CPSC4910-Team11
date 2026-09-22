from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from .models import SponsorCompany


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
