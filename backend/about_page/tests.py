from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AboutPageRelease


class CurrentAboutPageReleaseTests(APITestCase):
    url = reverse("about_page:current-release")

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
            product_name="Good Driver Incentive Program",
            product_description="A rewards program for safer driving.",
        )

    def test_returns_clear_404_when_no_release_exists(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data["detail"],
            "No About page release information is available.",
        )

    def test_returns_only_public_about_fields(self):
        self.create_release("Sprint 1", date(2026, 9, 15))

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data),
            {
                "team_number",
                "version_number",
                "release_date",
                "product_name",
                "product_description",
            },
        )

    def test_returns_release_with_newest_release_date(self):
        self.create_release("Sprint 3", date(2026, 9, 30))
        self.create_release("Sprint 2", date(2026, 9, 29))
        self.create_release("Sprint 1", date(2026, 9, 15))

        response = self.client.get(self.url)

        self.assertEqual(response.data["version_number"], "Sprint 3")
        self.assertEqual(response.data["release_date"], "2026-09-30")
