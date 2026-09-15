from datetime import date

from django.urls import reverse
from rest_framework.test import APITestCase

from .models import AboutInformation


class AboutInformationTests(APITestCase):
    def setUp(self):
        self.about = AboutInformation.objects.create(
            team_number=11,
            version='Sprint 1',
            release_date=date(2026, 9, 15),
            product_name='Good Driver Incentive Program',
            product_description='A rewards program for safer driving.',
        )

    def test_about_endpoint_returns_database_content(self):
        response = self.client.get(reverse('about-information'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['team_number'], 11)
        self.assertEqual(response.data['version'], 'Sprint 1')
        self.assertEqual(response.data['release_date'], '2026-09-15')
        self.assertEqual(response.data['product_name'], 'Good Driver Incentive Program')

    def test_about_endpoint_uses_most_recent_record(self):
        AboutInformation.objects.create(
            team_number=11,
            version='Sprint 2',
            release_date=date(2026, 9, 29),
            product_name='Good Driver Incentive Program',
            product_description='Updated description.',
        )

        response = self.client.get(reverse('about-information'))

        self.assertEqual(response.data['version'], 'Sprint 2')
