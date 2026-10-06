from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import LoginAttempt, MFASettings, SponsorAccount, SponsorCompany


class LoginAttemptsViewTests(APITestCase):
    url = reverse('accounts:login-attempts')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.sponsor = User.objects.create_user(
            username='sponsor.one', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor, company=company)
        cls.admin = User.objects.create_superuser(
            username='admin.one', password='ExamplePassword123!'
        )
        cls.driver = User.objects.create_user(
            username='driver.one', password='ExamplePassword123!'
        )
        Driver.objects.create(user=cls.driver, name='Driver One', status='approved')
        for user in (cls.sponsor, cls.admin, cls.driver):
            MFASettings.objects.create(user=user, totp_enabled=True)

    def attempt(self, user, successful=True, age=timedelta(0), username=None):
        attempt = LoginAttempt.objects.create(
            user=user,
            username=username or user.get_username(),
            successful=successful,
        )
        # auto_now_add ignores a timestamp passed to create(), so set it after.
        LoginAttempt.objects.filter(pk=attempt.pk).update(timestamp=timezone.now() - age)
        return attempt

    def ids(self, rows):
        return [row['id'] for row in rows]

    def test_recent_lists_last_three_attempts_newest_first(self):
        oldest = self.attempt(self.sponsor, age=timedelta(hours=4))
        third = self.attempt(self.sponsor, successful=False, age=timedelta(hours=3))
        second = self.attempt(self.sponsor, age=timedelta(hours=2))
        newest = self.attempt(self.sponsor, successful=False, age=timedelta(hours=1))
        self.client.force_authenticate(self.sponsor)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(response.data['recent']), [newest.pk, second.pk, third.pk])
        self.assertEqual(
            self.ids(response.data['last_24_hours']),
            [newest.pk, second.pk, third.pk, oldest.pk],
        )
        self.assertEqual(
            set(response.data['recent'][0]), {'id', 'timestamp', 'successful'}
        )
        self.assertFalse(response.data['recent'][0]['successful'])

    def test_last_24_hours_excludes_older_attempts(self):
        recent = self.attempt(self.admin, age=timedelta(hours=23))
        old = self.attempt(self.admin, age=timedelta(hours=25))
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(response.data['last_24_hours']), [recent.pk])
        # The recent list is not limited to the window.
        self.assertEqual(self.ids(response.data['recent']), [recent.pk, old.pk])

    def test_only_own_attempts_are_returned(self):
        own = self.attempt(self.sponsor)
        self.attempt(self.admin)
        # Unlinked rows with the same username (e.g. from before the FK
        # existed or after a rename) must not leak in.
        self.attempt(None, username='sponsor.one')
        self.client.force_authenticate(self.sponsor)

        response = self.client.get(self.url)

        self.assertEqual(self.ids(response.data['recent']), [own.pk])
        self.assertEqual(self.ids(response.data['last_24_hours']), [own.pk])

    def test_history_survives_username_change(self):
        attempt = self.attempt(self.sponsor)
        self.sponsor.username = 'sponsor.renamed'
        self.sponsor.save()
        self.client.force_authenticate(self.sponsor)

        response = self.client.get(self.url)

        self.assertEqual(self.ids(response.data['recent']), [attempt.pk])

    def test_empty_history(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.data, {'recent': [], 'last_24_hours': []})

    def test_driver_is_forbidden(self):
        self.attempt(self.driver)
        self.client.force_authenticate(self.driver)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_forbidden(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sponsor_without_mfa_is_forbidden(self):
        MFASettings.objects.filter(user=self.sponsor).update(totp_enabled=False)
        # Reload so the cached mfa_settings from setUpTestData isn't reused.
        self.client.force_authenticate(get_user_model().objects.get(pk=self.sponsor.pk))

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_response_is_not_cached(self):
        self.client.force_authenticate(self.sponsor)

        response = self.client.get(self.url)

        self.assertIn('no-cache', response.headers.get('Cache-Control', ''))
