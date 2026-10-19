from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AboutPageRelease


class CurrentAboutPageReleaseTests(APITestCase):
    url = reverse('about_page:current-release')

    def setUp(self):
        # Data migrations (e.g. seeding the Sprint 3 release) run once when
        # the test database is built, so rows they create persist across
        # every test. Clear them here so each test controls its own fixtures.
        AboutPageRelease.objects.all().delete()

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
        self.create_release('Sprint 3', date(2026, 9, 30))
        self.create_release('Sprint 2', date(2026, 9, 29))
        self.create_release('Sprint 1', date(2026, 9, 15))

        response = self.client.get(self.url)

        self.assertEqual(response.data['version_number'], 'Sprint 3')
        self.assertEqual(response.data['release_date'], '2026-09-30')


class AboutPageEditTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model

        from accounts.models import SponsorAccount, SponsorCompany
        from accounts.tests.common import enroll_totp

        cls.release = AboutPageRelease.objects.create(
            team_number=11,
            version_number='0.4.0',
            release_date='2026-10-01',
            product_name='Good Driver',
            product_description='Rewards safe driving.',
        )
        cls.admin_user = get_user_model().objects.create_user(
            username='about.admin',
            password='ExamplePassword123!',
            is_staff=True,
        )
        enroll_totp(cls.admin_user)
        cls.sponsor_user = get_user_model().objects.create_user(
            username='about.sponsor',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(
            user=cls.sponsor_user,
            company=SponsorCompany.objects.create(name='About Freight'),
        )
        enroll_totp(cls.sponsor_user)

    def test_admin_can_edit_the_current_release(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.patch(
            reverse('about_page:current-release'),
            {'product_description': 'Rewards safe miles.', 'version_number': '0.4.1'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.release.refresh_from_db()
        self.assertEqual(self.release.product_description, 'Rewards safe miles.')
        self.assertEqual(self.release.version_number, '0.4.1')

    def test_everyone_else_can_only_read_it(self):
        url = reverse('about_page:current-release')
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertIn(
            self.client.patch(url, {'product_name': 'Nope'}, format='json').status_code, (401, 403)
        )
        self.client.force_authenticate(self.sponsor_user)
        self.assertEqual(
            self.client.patch(url, {'product_name': 'Nope'}, format='json').status_code, 403
        )
        self.release.refresh_from_db()
        self.assertEqual(self.release.product_name, 'Good Driver')
