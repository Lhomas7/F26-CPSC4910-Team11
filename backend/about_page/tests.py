from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AboutPageRelease


class CurrentAboutPageReleaseTests(APITestCase):
    url = reverse('about_page:current-release')

    @staticmethod
    def create_release(version_number, release_date):
        return AboutPageRelease.objects.create(
            team_number=11,
            version_number=version_number,
            release_date=release_date,
            product_name='Good Driver Incentive Program',
            product_description='A rewards program for safer driving.',
        )

    def test_returns_clear_404_when_no_release_exists(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data['detail'],
            'No About page release information is available.',
        )

    def test_returns_only_public_about_fields(self):
        self.create_release('Sprint 1', date(2026, 9, 15))

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data),
            {
                'team_number',
                'version_number',
                'release_date',
                'product_name',
                'product_description',
            },
        )

    def test_returns_release_with_newest_release_date(self):
        self.create_release('Sprint 2', date(2026, 9, 29))
        self.create_release('Sprint 1', date(2026, 9, 15))

        response = self.client.get(self.url)

        self.assertEqual(response.data['version_number'], 'Sprint 2')
        self.assertEqual(response.data['release_date'], '2026-09-29')
