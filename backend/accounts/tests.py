from django.contrib.auth import get_user_model
from django.urls import reverse
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
