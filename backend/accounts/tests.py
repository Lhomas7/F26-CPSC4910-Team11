from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from .models import SponsorCompany


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
