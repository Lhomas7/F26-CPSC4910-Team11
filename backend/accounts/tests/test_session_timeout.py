from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..middleware import (
    ACTIVITY_WRITE_INTERVAL,
    IMPERSONATION_STARTED_KEY,
    IMPERSONATION_TARGET_KEY,
)
from ..services.session_state import AUTH_AT_KEY, LAST_ACTIVITY_KEY

PASSWORD = 'ExamplePassword123!'
ADMIN_LIMITS = settings.SESSION_TIMEOUTS['admin']
SHARED_LIMITS = settings.SESSION_TIMEOUTS['shared_device']


class SessionTimeoutTests(APITestCase):
    login_url = reverse('accounts:login')
    logout_url = reverse('accounts:logout')
    me_url = reverse('accounts:me')
    check_url = reverse('accounts:device-check')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(
            username='admin.one', password=PASSWORD, email='admin@example.com', is_staff=True
        )
        cls.driver_user = User.objects.create_user(
            username='driver.one', password=PASSWORD, email='driver@example.com'
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Driver One', status='approved'
        )

    def setUp(self):
        cache.clear()

    def login(self, username):
        response = self.client.post(
            self.login_url, {'username': username, 'password': PASSWORD}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response

    def age(self, *keys, seconds):
        """Move session timestamps into the past, as if time had passed."""
        session = self.client.session
        for key in keys:
            session[key] -= seconds
        session.save()

    def assert_expired(self, response):
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.json()['code'], 'session_expired')
        self.assertFalse(Session.objects.exists())
        self.assertFalse(self.client.get(self.me_url).data['authenticated'])

    def test_admin_sign_in_reports_the_idle_limit(self):
        response = self.login('admin.one')

        self.assertEqual(response.data['session']['idle_timeout_seconds'], ADMIN_LIMITS['idle'])

    def test_admin_is_signed_out_after_the_idle_limit(self):
        self.login('admin.one')
        self.age(LAST_ACTIVITY_KEY, AUTH_AT_KEY, seconds=ADMIN_LIMITS['idle'] + 1)

        self.assert_expired(self.client.get(self.me_url))

    def test_admin_inside_the_idle_limit_stays_signed_in(self):
        self.login('admin.one')
        self.age(LAST_ACTIVITY_KEY, AUTH_AT_KEY, seconds=ADMIN_LIMITS['idle'] - 60)

        response = self.client.get(self.me_url)

        self.assertTrue(response.data['authenticated'])

    def test_activity_resets_the_idle_clock(self):
        self.login('admin.one')
        partial = ADMIN_LIMITS['idle'] - 60
        self.age(LAST_ACTIVITY_KEY, AUTH_AT_KEY, seconds=partial)
        self.client.get(self.me_url)

        self.age(LAST_ACTIVITY_KEY, AUTH_AT_KEY, seconds=partial)
        response = self.client.get(self.me_url)

        self.assertTrue(response.data['authenticated'])

    def test_activity_writes_are_throttled(self):
        self.login('admin.one')
        self.age(LAST_ACTIVITY_KEY, seconds=ACTIVITY_WRITE_INTERVAL // 2)
        before = self.client.session[LAST_ACTIVITY_KEY]

        self.client.get(self.me_url)

        self.assertEqual(self.client.session[LAST_ACTIVITY_KEY], before)

    def test_admin_is_signed_out_after_the_absolute_limit_even_when_active(self):
        self.login('admin.one')
        self.age(AUTH_AT_KEY, seconds=ADMIN_LIMITS['absolute'] + 1)

        self.assert_expired(self.client.get(self.me_url))

    def test_logout_after_expiry_still_returns_204(self):
        self.login('admin.one')
        self.age(LAST_ACTIVITY_KEY, AUTH_AT_KEY, seconds=ADMIN_LIMITS['idle'] + 1)

        response = self.client.post(self.logout_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Session.objects.exists())

    def test_admin_viewing_as_a_driver_keeps_the_admin_limit(self):
        self.client.force_login(self.admin)
        session = self.client.session
        session[IMPERSONATION_TARGET_KEY] = self.driver_user.pk
        session[IMPERSONATION_STARTED_KEY] = timezone.now().isoformat()
        stale = timezone.now().timestamp() - ADMIN_LIMITS['idle'] - 1
        session[AUTH_AT_KEY] = stale
        session[LAST_ACTIVITY_KEY] = stale
        session.save()

        self.assert_expired(self.client.get(self.me_url))

    def test_sessions_without_stamps_start_the_clock_instead_of_expiring(self):
        self.client.force_login(self.admin)

        response = self.client.get(self.me_url)

        self.assertTrue(response.data['authenticated'])
        self.assertIn(LAST_ACTIVITY_KEY, self.client.session)
        self.assertIn(AUTH_AT_KEY, self.client.session)

    def test_driver_on_a_trusted_device_has_no_idle_limit(self):
        response = self.login('driver.one')
        self.client.post(self.check_url, {'trusted': True}, format='json')
        self.age(LAST_ACTIVITY_KEY, AUTH_AT_KEY, seconds=24 * 60 * 60)

        self.assertIsNone(response.data['session']['idle_timeout_seconds'])
        self.assertTrue(self.client.get(self.me_url).data['authenticated'])

    def test_driver_on_a_shared_device_gets_the_shared_idle_limit(self):
        self.login('driver.one')
        answer = self.client.post(self.check_url, {'trusted': False}, format='json')
        self.assertEqual(answer.data['session']['idle_timeout_seconds'], SHARED_LIMITS['idle'])
        self.age(LAST_ACTIVITY_KEY, AUTH_AT_KEY, seconds=SHARED_LIMITS['idle'] + 1)

        self.assert_expired(self.client.get(self.me_url))
