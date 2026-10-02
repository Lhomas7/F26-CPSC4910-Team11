import logging
import re
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

from ..models import (
    AdminImpersonationEvent,
    DriverNotification,
    LoginAttempt,
    MFABackupCode,
    MFACode,
    MFASettings,
    SponsorAccount,
    SponsorCompany,
)
from ..middleware import IMPERSONATION_STARTED_KEY
from ..services.crypto import decrypt_secret, encrypt_secret
from ..services.mfa import backup_codes_remaining, create_mfa_code

class ChangePasswordTests(APITestCase):
    url = reverse('accounts:change-password')

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='driver.one',
            email='driver@example.com',
            password='ExamplePassword123!',
        )
        self.client.force_authenticate(self.user)

    def test_requires_matching_confirmation(self):
        response = self.client.post(
            self.url,
            {
                'password': 'ValidSecurePassword22!',
                'password_confirm': 'DifferentSecurePassword33!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', response.data)

    def test_changes_password_after_server_side_validation(self):
        password = 'ValidSecurePassword22!'
        response = self.client.post(
            self.url,
            {'password': password, 'password_confirm': password},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(password))

    def test_rejects_reusing_the_current_password(self):
        response = self.client.post(
            self.url,
            {
                'password': 'ExamplePassword123!',
                'password_confirm': 'ExamplePassword123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)





class LoginAttemptLoggingTests(APITestCase):
    login_url = reverse('accounts:login')
    mfa_login_url = reverse('accounts:login-mfa')

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        Driver.objects.create(user=cls.user, name='Driver One', status='approved')

    def setUp(self):
        cache.clear()

    def login(self, username='driver.one', password='ExamplePassword123!'):
        return self.client.post(
            self.login_url,
            {'username': username, 'password': password},
            format='json',
        )

    def test_successful_login_is_recorded(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'driver.one')
        self.assertTrue(attempt.successful)
        self.assertIsNotNone(attempt.timestamp)

    def test_wrong_password_is_recorded_as_failure(self):
        response = self.login(password='WrongPassword123!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'driver.one')
        self.assertFalse(attempt.successful)

    def test_unknown_username_is_recorded_as_failure(self):
        response = self.login(username='nobody.here')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'nobody.here')
        self.assertFalse(attempt.successful)

    def test_password_is_never_stored(self):
        self.login(password='WrongPassword123!')

        stored = str(list(LoginAttempt.objects.values()))
        self.assertNotIn('WrongPassword123!', stored)

    def test_mfa_password_step_alone_is_not_recorded(self):
        MFASettings.objects.create(user=self.user, email_enabled=True)

        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('mfa', response.data)
        self.assertEqual(LoginAttempt.objects.count(), 0)

    def test_mfa_success_is_recorded_when_second_factor_passes(self):
        MFASettings.objects.create(user=self.user, email_enabled=True)
        self.login()
        raw_code = create_mfa_code(self.user, purpose='login', method='email')

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': raw_code},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'driver.one')
        self.assertTrue(attempt.successful)

    def test_mfa_wrong_code_is_recorded_as_failure(self):
        MFASettings.objects.create(user=self.user, email_enabled=True)
        self.login()
        create_mfa_code(self.user, purpose='login', method='email')

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': '000000'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'driver.one')
        self.assertFalse(attempt.successful)


class PasswordResetTests(APITestCase):
    request_url = reverse('accounts:password-reset')
    confirm_url = reverse('accounts:password-reset-confirm')
    new_password = 'ValidSecurePassword22!'

    def setUp(self):
        cache.clear()
        mail.outbox = []
        self.user = get_user_model().objects.create_user(
            username='driver.one',
            email='driver@example.com',
            password='ExamplePassword123!',
        )
        self.driver = Driver.objects.create(user=self.user, name='Driver One', status='approved')

    def request_reset(self, email='driver@example.com'):
        return self.client.post(self.request_url, {'email': email}, format='json')

    def issue_link(self):
        """Request a reset and return the (uid, token) from the emailed link."""
        self.request_reset()
        self.assertEqual(len(mail.outbox), 1)
        match = re.search(r'/reset-password/([^/\s]+)/([^/\s]+)', mail.outbox[0].body)
        self.assertIsNotNone(match)
        mail.outbox = []
        return match.group(1), match.group(2)

    def confirm(self, uid, token, password=None, confirmation=None):
        password = password or self.new_password
        return self.client.post(
            self.confirm_url,
            {
                'uid': uid,
                'token': token,
                'password': password,
                'password_confirm': confirmation or password,
            },
            format='json',
        )

    @override_settings(FRONTEND_URL='https://app.example.com')
    def test_request_emails_a_reset_link_for_a_known_address(self):
        response = self.request_reset()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['driver@example.com'])
        self.assertIn('https://app.example.com/reset-password/', mail.outbox[0].body)

    def test_email_matching_is_case_insensitive(self):
        self.request_reset(email='Driver@Example.com')

        self.assertEqual(len(mail.outbox), 1)

    def test_unknown_address_gets_identical_response_and_no_email(self):
        known = self.request_reset()
        cache.clear()
        mail.outbox = []
        unknown = self.request_reset(email='nobody@example.com')

        self.assertEqual(unknown.status_code, known.status_code)
        self.assertEqual(unknown.data, known.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_inactive_account_gets_no_email(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])

        response = self.request_reset()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_repeated_requests_are_throttled_without_changing_the_response(self):
        first = self.request_reset()
        second = self.request_reset()

        self.assertEqual(second.status_code, first.status_code)
        self.assertEqual(second.data, first.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_malformed_email_is_rejected(self):
        response = self.request_reset(email='not-an-email')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)

    @patch(
        'accounts.views.authentication.send_password_reset_email',
        side_effect=RuntimeError('smtp down'),
    )
    def test_delivery_failure_does_not_change_the_response(self, _send):
        with self.assertLogs('accounts.views.authentication', level='ERROR'):
            response = self.request_reset()

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_confirm_sets_the_new_password(self):
        uid, token = self.issue_link()

        response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))

    def test_link_can_only_be_used_once(self):
        uid, token = self.issue_link()
        self.confirm(uid, token)

        response = self.confirm(uid, token, password='AnotherSecurePass33!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))

    def test_expired_link_is_rejected(self):
        uid, token = self.issue_link()

        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ExamplePassword123!'))

    def test_invalid_token_and_uid_are_rejected_with_the_same_message(self):
        uid, token = self.issue_link()

        bad_token = self.confirm(uid, 'not-a-real-token')
        bad_uid = self.confirm('zzzz', token)

        self.assertEqual(bad_token.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_uid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_token.data, bad_uid.data)

    def test_confirm_enforces_the_password_policy(self):
        uid, token = self.issue_link()

        response = self.confirm(uid, token, password='short')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ExamplePassword123!'))

    def test_confirm_requires_matching_confirmation(self):
        uid, token = self.issue_link()

        response = self.confirm(uid, token, confirmation='DifferentSecurePass33!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', response.data)

    def test_reset_sends_email_and_in_app_notification(self):
        uid, token = self.issue_link()

        self.confirm(uid, token)

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['driver@example.com'])
        self.assertIn('was reset', mail.outbox[0].subject)
        self.assertNotIn(self.new_password, mail.outbox[0].body)
        self.assertEqual(DriverNotification.objects.filter(driver=self.driver).count(), 1)

    def test_failed_confirm_sends_no_notification(self):
        uid, token = self.issue_link()

        self.confirm(uid, token, password='short')

        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(DriverNotification.objects.count(), 0)

    def test_existing_sessions_stop_working_after_reset(self):
        self.client.force_login(self.user)
        self.assertTrue(self.client.get(reverse('accounts:me')).data['authenticated'])
        uid, token = self.issue_link()

        self.confirm(uid, token)

        self.assertFalse(self.client.get(reverse('accounts:me')).data['authenticated'])

    def test_confirm_rejects_reusing_the_current_password(self):
        uid, token = self.issue_link()

        response = self.confirm(uid, token, password='ExamplePassword123!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ExamplePassword123!'))

class PasswordResetExcludesAdminsTests(APITestCase):
    request_url = reverse('accounts:password-reset')

    def setUp(self):
        cache.clear()
        mail.outbox = []

    def test_staff_account_email_sends_no_reset_link(self):
        get_user_model().objects.create_user(
            username='admin.one',
            email='admin@example.com',
            password='ExamplePassword123!',
            is_staff=True,
        )

        response = self.client.post(self.request_url, {'email': 'admin@example.com'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_superuser_account_email_sends_no_reset_link(self):
        get_user_model().objects.create_superuser(
            username='super.one',
            email='super@example.com',
            password='ExamplePassword123!',
        )

        response = self.client.post(self.request_url, {'email': 'super@example.com'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_driver_account_is_unaffected(self):
        user = get_user_model().objects.create_user(
            username='driver.one',
            email='driver@example.com',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=user, name='Driver One', status='approved')

        response = self.client.post(self.request_url, {'email': 'driver@example.com'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

