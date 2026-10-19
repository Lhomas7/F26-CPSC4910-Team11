import logging
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import pyotp
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import (
    DriverNotification,
    MFACode,
    MFASettings,
    SponsorAccount,
    SponsorCompany,
)
from ..services.crypto import decrypt_secret, encrypt_secret
from ..services.mfa import backup_codes_remaining
from .common import MailAssertMixin, enroll_totp


class MFAPhoneNumberValidationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username='phone.user',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=cls.user, name='Phone User')

    def setUp(self):
        self.client.force_authenticate(self.user)

    @patch('accounts.views.mfa.send_sms_code')
    def test_accepts_normalized_international_phone_number(self, mock_send_sms):
        response = self.client.post(
            reverse('accounts:mfa-setup'),
            {'method': 'sms', 'phone_number': '+18645551234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.mfa_settings.refresh_from_db()
        self.assertEqual(self.user.mfa_settings.phone_number, '+18645551234')
        mock_send_sms.assert_called_once()

    def test_rejects_unformatted_or_incomplete_phone_number(self):
        response = self.client.post(
            reverse('accounts:mfa-setup'),
            {'method': 'sms', 'phone_number': '(864) 555-1234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone_number', response.data)


class MFAEnrollmentTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.user)

    @patch('accounts.views.mfa.send_email_code')
    def test_email_method_stays_disabled_until_correct_enroll_code(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        response = self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'enroll', 'method': 'email'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        raw_code = mock_send_email.call_args[0][1]

        mfa, _ = MFASettings.objects.get_or_create(user=self.user)
        self.assertFalse(mfa.email_enabled)

        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': '000000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mfa.refresh_from_db()
        self.assertFalse(mfa.email_enabled)

        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': raw_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mfa.refresh_from_db()
        self.assertTrue(mfa.email_enabled)

    def test_enroll_purpose_code_cannot_satisfy_a_login_challenge(self):
        MFACode.objects.create(
            user=self.user,
            purpose='login',
            method='email',
            code_hash=make_password('123456'),
            expires_at=timezone.now() + timedelta(minutes=5),
        )

        # MFAVerifyView only accepts enroll-purpose codes, so a login code is rejected.
        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_totp_verify_before_enable(self):
        secret = pyotp.random_base32()
        mfa, _ = MFASettings.objects.get_or_create(user=self.user)
        mfa.totp_secret_encrypted = encrypt_secret(secret)
        mfa.save(update_fields=['totp_secret_encrypted'])
        self.assertFalse(mfa.totp_enabled)

        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'totp', 'code': '000000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mfa.refresh_from_db()
        self.assertFalse(mfa.totp_enabled)

        code = pyotp.TOTP(secret).now()
        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'totp', 'code': code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mfa.refresh_from_db()
        self.assertTrue(mfa.totp_enabled)


class RoleMFAPolicyTests(APITestCase):
    """Each role gets its own default/allowed MFA methods (accounts/services/__init__.py)."""

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Acme Co')
        cls.admin = get_user_model().objects.create_superuser(
            username='policy.admin', password='ExamplePassword123!'
        )
        cls.sponsor_user = get_user_model().objects.create_user(
            username='policy.sponsor', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.driver_user = get_user_model().objects.create_user(
            username='policy.driver', password='ExamplePassword123!'
        )
        Driver.objects.create(user=cls.driver_user, name='Policy Driver', sponsor=cls.company)

    def setUp(self):
        cache.clear()

    def status_for(self, user):
        self.client.force_authenticate(user)
        response = self.client.get(reverse('accounts:mfa-status'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data['mfa']

    def test_admin_requires_totp_only(self):
        mfa = self.status_for(self.admin)
        self.assertTrue(mfa['required'])
        self.assertEqual(mfa['default_method'], 'totp')
        self.assertEqual(mfa['allowed_methods'], ['totp'])

    def test_sponsor_defaults_to_totp_but_may_opt_into_others(self):
        mfa = self.status_for(self.sponsor_user)
        self.assertTrue(mfa['required'])
        self.assertEqual(mfa['default_method'], 'totp')
        self.assertEqual(mfa['allowed_methods'], ['totp', 'email', 'sms'])

    def test_driver_defaults_to_email_and_is_not_required_by_default(self):
        mfa = self.status_for(self.driver_user)
        self.assertFalse(mfa['required'])
        self.assertEqual(mfa['default_method'], 'email')
        self.assertEqual(mfa['allowed_methods'], ['email', 'sms', 'totp'])

    def test_driver_required_when_sponsor_company_opts_in(self):
        self.company.driver_mfa_required = True
        self.company.save(update_fields=['driver_mfa_required'])

        mfa = self.status_for(self.driver_user)
        self.assertTrue(mfa['required'])

    def test_admin_setup_rejects_email_and_sms(self):
        self.client.force_authenticate(self.admin)

        email_response = self.client.post(
            reverse('accounts:mfa-setup'), {'method': 'email'}, format='json'
        )
        sms_response = self.client.post(
            reverse('accounts:mfa-setup'),
            {'method': 'sms', 'phone_number': '+18645551234'},
            format='json',
        )

        self.assertEqual(email_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(sms_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(MFASettings.objects.filter(user=self.admin, email_enabled=True).exists())

    def test_admin_setup_accepts_totp(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('accounts:mfa-setup'), {'method': 'totp'}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('qr_code', response.data)


class BackupCodeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(user=cls.user, name='Driver One', sponsor=cls.company)

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.user)

    @patch('accounts.views.mfa.send_email_code')
    def enable_email(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'enroll', 'method': 'email'},
            format='json',
        )
        raw_code = mock_send_email.call_args[0][1]
        return self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': raw_code},
            format='json',
        )

    def test_enabling_the_first_method_returns_ten_one_time_backup_codes(self):
        response = self.enable_email()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = response.data['backup_codes']
        self.assertEqual(len(codes), 10)
        self.assertEqual(len(set(codes)), 10)
        self.assertEqual(backup_codes_remaining(self.user), 10)

    @patch('accounts.views.mfa.send_sms_code')
    def test_enabling_a_second_method_does_not_reissue_backup_codes(self, mock_send_sms):
        mock_send_sms.side_effect = lambda phone, code: None
        self.enable_email()

        self.client.post(
            reverse('accounts:mfa-setup'),
            {'method': 'sms', 'phone_number': '+18645551234'},
            format='json',
        )
        raw_code = mock_send_sms.call_args[0][1]
        response = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'sms', 'code': raw_code},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('backup_codes', response.data)
        self.assertEqual(backup_codes_remaining(self.user), 10)

    def test_backup_code_is_single_use(self):
        codes = self.enable_email().data['backup_codes']
        code = codes[0]
        # Drop the forced auth used to reach the authenticated setup endpoints
        # above, so the requests below exercise the real anonymous login flow.
        self.client.force_authenticate(user=None)

        login = self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )
        self.assertTrue(login.data['mfa']['enrolled'])

        first = self.client.post(
            reverse('accounts:login-mfa'), {'method': 'backup', 'code': code}, format='json'
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(backup_codes_remaining(self.user), 9)

        self.client.post(reverse('accounts:logout'))
        self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )
        second = self.client.post(
            reverse('accounts:login-mfa'), {'method': 'backup', 'code': code}, format='json'
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_backup_code_accepted_with_dashes_or_lowercase(self):
        code = self.enable_email().data['backup_codes'][0]
        messy = '-'.join([code.lower()[:5], code.lower()[5:]])
        self.client.force_authenticate(user=None)
        self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )

        response = self.client.post(
            reverse('accounts:login-mfa'), {'method': 'backup', 'code': messy}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_regenerate_requires_correct_password_and_replaces_codes(self):
        original_codes = set(self.enable_email().data['backup_codes'])

        wrong_password = self.client.post(
            reverse('accounts:mfa-backup-codes-regenerate'),
            {'password': 'wrongpassword!'},
            format='json',
        )
        self.assertEqual(wrong_password.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            reverse('accounts:mfa-backup-codes-regenerate'),
            {'password': 'ExamplePassword123!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_codes = set(response.data['backup_codes'])
        self.assertEqual(len(new_codes), 10)
        self.assertTrue(original_codes.isdisjoint(new_codes))
        self.assertEqual(backup_codes_remaining(self.user), 10)

    def test_regenerate_rejected_before_any_method_is_enabled(self):
        response = self.client.post(
            reverse('accounts:mfa-backup-codes-regenerate'),
            {'password': 'ExamplePassword123!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_disabling_the_last_method_clears_backup_codes(self):
        self.enable_email()
        self.assertEqual(backup_codes_remaining(self.user), 10)

        response = self.client.post(
            reverse('accounts:mfa-disable'),
            {'method': 'email', 'password': 'ExamplePassword123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(backup_codes_remaining(self.user), 0)

    def test_backup_code_recovers_a_lost_authenticator_via_reset(self):
        # Mirrors an admin: TOTP-only, no email/SMS fallback, relies on backup codes.
        admin = get_user_model().objects.create_superuser(
            username='locked.admin', password='ExamplePassword123!'
        )
        self.client.force_authenticate(admin)
        setup = self.client.post(reverse('accounts:mfa-setup'), {'method': 'totp'}, format='json')
        secret = setup.data['manual_key']
        verify = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'totp', 'code': pyotp.TOTP(secret).now()},
            format='json',
        )
        backup_code = verify.data['backup_codes'][0]
        original_secret = secret

        response = self.client.post(
            reverse('accounts:mfa-reset'),
            {'fallback_method': 'backup', 'fallback_code': backup_code},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('manual_key', response.data)
        self.assertNotEqual(response.data['manual_key'], original_secret)
        self.assertEqual(backup_codes_remaining(admin), 9)


class MFAEnrolledPermissionTests(APITestCase):
    """Backend enforcement: privileged endpoints 403 until MFA is enrolled."""

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Acme Co')
        cls.admin = get_user_model().objects.create_superuser(
            username='gate.admin', password='ExamplePassword123!'
        )
        cls.sponsor_user = get_user_model().objects.create_user(
            username='gate.sponsor', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)

    def test_admin_endpoint_blocked_until_admin_enrolls(self):
        self.client.force_authenticate(self.admin)

        before = self.client.get(reverse('accounts:admin-user-list'))
        self.assertEqual(before.status_code, status.HTTP_403_FORBIDDEN)

        enroll_totp(self.admin)

        after = self.client.get(reverse('accounts:admin-user-list'))
        self.assertEqual(after.status_code, status.HTTP_200_OK)

    def test_sponsor_endpoint_blocked_until_sponsor_enrolls(self):
        self.client.force_authenticate(self.sponsor_user)

        before = self.client.get(reverse('accounts:sponsor-mfa-settings'))
        self.assertEqual(before.status_code, status.HTTP_403_FORBIDDEN)

        enroll_totp(self.sponsor_user)

        after = self.client.get(reverse('accounts:sponsor-mfa-settings'))
        self.assertEqual(after.status_code, status.HTTP_200_OK)

    def test_self_service_endpoints_stay_reachable_before_enrollment(self):
        self.client.force_authenticate(self.admin)

        me = self.client.get(reverse('accounts:me'))
        profile = self.client.get(reverse('accounts:self-profile'))
        mfa_status = self.client.get(reverse('accounts:mfa-status'))

        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        self.assertEqual(mfa_status.status_code, status.HTTP_200_OK)


class MFALoginTests(APITestCase):
    login_url = reverse('accounts:login')
    mfa_login_url = reverse('accounts:login-mfa')

    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

    def setUp(self):
        cache.clear()
        self.mfa, _ = MFASettings.objects.get_or_create(user=self.user)

    def login(self):
        return self.client.post(
            self.login_url,
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )

    def test_login_without_mfa_logs_in_directly(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('id', response.data)
        self.assertEqual(response.data['mfa']['enrolled'], False)
        self.assertEqual(response.data['mfa']['methods'], [])

    def test_login_with_mfa_returns_challenge_and_creates_no_session(self):
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                'mfa': {
                    'required': False,
                    'enrolled': True,
                    'methods': ['email'],
                    'default_method': 'email',
                    'allowed_methods': ['email', 'sms', 'totp'],
                    'backup_codes_remaining': 0,
                }
            },
        )

        me = self.client.get(reverse('accounts:me'))
        self.assertEqual(me.data, {'authenticated': False})

    @patch('accounts.views.authentication.send_email_code')
    def test_login_mfa_correct_code_logs_in(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        self.login()
        self.client.post(
            reverse('accounts:login-mfa-request-code'),
            {'method': 'email'},
            format='json',
        )
        raw_code = mock_send_email.call_args[0][1]

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': raw_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('id', response.data)
        self.assertEqual(response.data['username'], 'driver.one')

    @patch('accounts.views.authentication.send_email_code')
    def test_wrong_code_increments_attempts_and_sixth_rejected(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        self.login()
        self.client.post(
            reverse('accounts:login-mfa-request-code'),
            {'method': 'email'},
            format='json',
        )
        raw_code = mock_send_email.call_args[0][1]

        for _ in range(5):
            response = self.client.post(
                self.mfa_login_url,
                {'method': 'email', 'code': '000000'},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': raw_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch('accounts.views.authentication.send_sms_code')
    @patch('accounts.views.authentication.send_email_code')
    def test_login_with_mfa_sends_no_codes(self, mock_send_email, mock_send_sms):
        mock_send_email.side_effect = lambda user, code: None
        mock_send_sms.side_effect = lambda phone, code: None
        self.mfa.email_enabled = True
        self.mfa.sms_enabled = True
        self.mfa.phone_number = '+18645551234'
        self.mfa.save(update_fields=['email_enabled', 'sms_enabled', 'phone_number'])

        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        mock_send_email.assert_not_called()
        mock_send_sms.assert_not_called()

    def test_expired_pending_session_is_rejected(self):
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])

        self.login()
        session = self.client.session
        session['pending_mfa_expires'] = (timezone.now() - timedelta(seconds=1)).isoformat()
        session.save()

        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_mfa_without_pending_session_rejected(self):
        response = self.client.post(
            self.mfa_login_url,
            {'method': 'email', 'code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginMFARequestCodeTests(APITestCase):
    url = reverse('accounts:login-mfa-request-code')

    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

    def setUp(self):
        cache.clear()
        self.mfa, _ = MFASettings.objects.get_or_create(user=self.user)

    def login(self):
        return self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )

    def test_rejected_without_pending_session(self):
        response = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejected_for_method_that_is_not_enabled(self):
        self.mfa.sms_enabled = True
        self.mfa.save(update_fields=['sms_enabled'])
        self.login()

        response = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sms_rejected_without_a_phone_number(self):
        self.mfa.sms_enabled = True
        self.mfa.save(update_fields=['sms_enabled'])
        self.login()

        response = self.client.post(self.url, {'method': 'sms'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_totp_rejected_by_serializer(self):
        self.login()

        response = self.client.post(self.url, {'method': 'totp'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('accounts.views.authentication.send_sms_code')
    @patch('accounts.views.authentication.send_email_code')
    def test_only_selected_method_is_delivered(self, mock_send_email, mock_send_sms):
        mock_send_email.side_effect = lambda user, code: None
        mock_send_sms.side_effect = lambda phone, code: None
        self.mfa.email_enabled = True
        self.mfa.sms_enabled = True
        self.mfa.phone_number = '+18645551234'
        self.mfa.save(update_fields=['email_enabled', 'sms_enabled', 'phone_number'])
        self.login()

        self.client.post(self.url, {'method': 'email'}, format='json')
        mock_send_email.assert_called_once()
        mock_send_sms.assert_not_called()

        cache.clear()
        mock_send_email.reset_mock()
        self.client.post(self.url, {'method': 'sms'}, format='json')
        mock_send_sms.assert_called_once_with('+18645551234', mock_send_sms.call_args[0][1])
        mock_send_email.assert_not_called()

    @patch('accounts.views.authentication.send_email_code')
    def test_rejected_on_second_call_within_30_seconds(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.mfa.email_enabled = True
        self.mfa.save(update_fields=['email_enabled'])
        self.login()

        first = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(self.url, {'method': 'email'}, format='json')
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class MFACodeInvalidationTests(APITestCase):
    """A resent code retires the code it replaces (accounts/services/mfa.py)."""

    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

    def setUp(self):
        cache.clear()

    @patch('accounts.views.mfa.send_email_code')
    def test_resending_an_enroll_code_invalidates_the_previous_one(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.client.force_authenticate(self.user)

        self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'enroll', 'method': 'email'},
            format='json',
        )
        old_code = mock_send_email.call_args[0][1]

        cache.clear()
        self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'enroll', 'method': 'email'},
            format='json',
        )
        new_code = mock_send_email.call_args[0][1]
        self.assertNotEqual(old_code, new_code)

        stale = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': old_code},
            format='json',
        )
        self.assertEqual(stale.status_code, status.HTTP_400_BAD_REQUEST)

        fresh = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': new_code},
            format='json',
        )
        self.assertEqual(fresh.status_code, status.HTTP_200_OK)

    @patch('accounts.views.authentication.send_email_code')
    def test_resending_a_login_code_invalidates_the_previous_one(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        mfa, _ = MFASettings.objects.get_or_create(user=self.user)
        mfa.email_enabled = True
        mfa.save(update_fields=['email_enabled'])

        self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )
        self.client.post(
            reverse('accounts:login-mfa-request-code'),
            {'method': 'email'},
            format='json',
        )
        old_code = mock_send_email.call_args[0][1]

        cache.clear()
        self.client.post(
            reverse('accounts:login-mfa-request-code'),
            {'method': 'email'},
            format='json',
        )
        new_code = mock_send_email.call_args[0][1]
        self.assertNotEqual(old_code, new_code)

        stale = self.client.post(
            reverse('accounts:login-mfa'),
            {'method': 'email', 'code': old_code},
            format='json',
        )
        self.assertEqual(stale.status_code, status.HTTP_400_BAD_REQUEST)

        fresh = self.client.post(
            reverse('accounts:login-mfa'),
            {'method': 'email', 'code': new_code},
            format='json',
        )
        self.assertEqual(fresh.status_code, status.HTTP_200_OK)

    @patch('accounts.views.mfa.send_email_code')
    def test_a_used_code_cannot_be_used_again(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        self.client.force_authenticate(self.user)

        self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'enroll', 'method': 'email'},
            format='json',
        )
        code = mock_send_email.call_args[0][1]

        first = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': code},
            format='json',
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': code},
            format='json',
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)


class MFAResetTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        self.mfa = MFASettings.objects.create(user=self.user)
        self.client.force_authenticate(self.user)
        cache.clear()

    def test_reset_fails_without_valid_fallback_code(self):
        self.mfa.totp_enabled = True
        self.mfa.email_enabled = True
        self.mfa.totp_secret_encrypted = encrypt_secret(pyotp.random_base32())
        self.mfa.save()

        response = self.client.post(
            reverse('accounts:mfa-reset'),
            {'fallback_method': 'email', 'fallback_code': '123456'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('accounts.views.mfa.send_email_code')
    def test_reset_succeeds_and_rotates_secret(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        original_secret = pyotp.random_base32()
        self.mfa.totp_enabled = True
        self.mfa.email_enabled = True
        self.mfa.totp_secret_encrypted = encrypt_secret(original_secret)
        self.mfa.save()

        self.client.post(
            reverse('accounts:mfa-request-code'),
            {'purpose': 'reset', 'method': 'email'},
            format='json',
        )
        fallback_code = mock_send_email.call_args[0][1]

        response = self.client.post(
            reverse('accounts:mfa-reset'),
            {'fallback_method': 'email', 'fallback_code': fallback_code},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('qr_code', response.data)
        self.assertIn('manual_key', response.data)

        self.mfa.refresh_from_db()
        new_secret = decrypt_secret(self.mfa.totp_secret_encrypted)
        self.assertNotEqual(original_secret, new_secret)


class MFADisableTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
        )
        self.mfa = MFASettings.objects.create(user=self.user, email_enabled=True)
        self.client.force_authenticate(self.user)
        cache.clear()

    def test_disable_fails_without_correct_password(self):
        response = self.client.post(
            reverse('accounts:mfa-disable'),
            {'method': 'email', 'password': 'wrongpassword!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.mfa.refresh_from_db()
        self.assertTrue(self.mfa.email_enabled)

    def test_disable_succeeds_with_correct_password(self):
        response = self.client.post(
            reverse('accounts:mfa-disable'),
            {'method': 'email', 'password': 'ExamplePassword123!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mfa.refresh_from_db()
        self.assertFalse(self.mfa.email_enabled)


class SponsorMFATests(MailAssertMixin, APITestCase):
    url = reverse('accounts:sponsor-mfa-settings')

    @classmethod
    def setUpTestData(cls):
        cls.sponsor_user = get_user_model().objects.create_user(
            username='sponsor.one',
            password='ExamplePassword123!',
        )
        cls.sponsor = SponsorCompany.objects.create(name='Acme Co')
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.sponsor)
        enroll_totp(cls.sponsor_user)

        cls.driver_user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver1@example.com',
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user,
            name='Driver One',
            sponsor=cls.sponsor,
            status='approved',
        )

        cls.other_sponsor_user = get_user_model().objects.create_user(
            username='sponsor.two',
            password='ExamplePassword123!',
        )
        cls.other_sponsor = SponsorCompany.objects.create(name='Other Co')
        SponsorAccount.objects.create(user=cls.other_sponsor_user, company=cls.other_sponsor)

        cls.other_driver_user = get_user_model().objects.create_user(
            username='driver.two',
            password='ExamplePassword123!',
            email='driver2@example.com',
        )
        cls.other_driver = Driver.objects.create(
            user=cls.other_driver_user,
            name='Driver Two',
            sponsor=cls.other_sponsor,
            status='approved',
        )

    def setUp(self):
        self.client.force_authenticate(self.sponsor_user)
        cache.clear()

    def test_toggle_notifies_own_company_drivers_only(self):
        with self.assertSendsMail(1):
            response = self.client.post(self.url, {'driver_mfa_required': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'driver_mfa_required': True})

        self.assertTrue(DriverNotification.objects.filter(driver=self.driver).exists())
        self.assertFalse(DriverNotification.objects.filter(driver=self.other_driver).exists())

    def test_toggle_off_also_notifies_drivers(self):
        self.sponsor.driver_mfa_required = True
        self.sponsor.save(update_fields=['driver_mfa_required'])

        with self.assertSendsMail(1):
            response = self.client.post(self.url, {'driver_mfa_required': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(DriverNotification.objects.filter(driver=self.driver).exists())
        self.assertFalse(DriverNotification.objects.filter(driver=self.other_driver).exists())

    def test_get_returns_current_setting_for_sponsor(self):
        self.sponsor.driver_mfa_required = True
        self.sponsor.save(update_fields=['driver_mfa_required'])

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'driver_mfa_required': True})

    def test_get_rejected_for_non_sponsor(self):
        self.client.force_authenticate(self.driver_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_sponsor_rejected(self):
        self.client.force_authenticate(self.driver_user)
        response = self.client.post(self.url, {'driver_mfa_required': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MFANotificationTests(MailAssertMixin, APITestCase):
    def setUp(self):
        self.sponsor = SponsorCompany.objects.create(name='Acme Co')
        self.driver_user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        self.driver = Driver.objects.create(
            user=self.driver_user,
            name='Driver One',
            sponsor=self.sponsor,
            status='approved',
        )
        cache.clear()

    def enable_email(self):
        with patch('accounts.views.mfa.send_email_code') as mock_send_email:
            mock_send_email.side_effect = lambda user, code: None
            self.client.post(
                reverse('accounts:mfa-request-code'),
                {'purpose': 'enroll', 'method': 'email'},
                format='json',
            )
            raw_code = mock_send_email.call_args[0][1]
        self.client.post(
            reverse('accounts:mfa-verify'),
            {'method': 'email', 'code': raw_code},
            format='json',
        )

    def test_driver_enabling_method_creates_notification_and_email(self):
        self.client.force_authenticate(self.driver_user)

        with self.assertSendsMail(1):
            self.enable_email()

        self.assertTrue(DriverNotification.objects.filter(driver=self.driver).exists())
        self.assertEqual(mail.outbox[0].to, ['driver@example.com'])

    def test_driver_disabling_method_creates_notification_and_email(self):
        self.client.force_authenticate(self.driver_user)

        with self.assertSendsMail(1):
            self.enable_email()
        self.assertEqual(DriverNotification.objects.count(), 1)

        with self.assertSendsMail(1):
            response = self.client.post(
                reverse('accounts:mfa-disable'),
                {'method': 'email', 'password': 'ExamplePassword123!'},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(DriverNotification.objects.count(), 2)

    def test_sponsor_enabling_method_creates_no_driver_notification(self):
        sponsor_user = get_user_model().objects.create_user(
            username='sponsor.one',
            password='ExamplePassword123!',
            email='sponsor@example.com',
        )
        SponsorAccount.objects.create(user=sponsor_user, company=self.sponsor)
        self.client.force_authenticate(sponsor_user)

        with patch('accounts.views.mfa.send_email_code') as mock_send_email:
            mock_send_email.side_effect = lambda user, code: None
            self.client.post(
                reverse('accounts:mfa-request-code'),
                {'purpose': 'enroll', 'method': 'email'},
                format='json',
            )
            raw_code = mock_send_email.call_args[0][1]

        with self.assertSendsMail(0):
            response = self.client.post(
                reverse('accounts:mfa-verify'),
                {'method': 'email', 'code': raw_code},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(DriverNotification.objects.filter(driver=self.driver).exists())


class MFARequestCodeThrottleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.user)

    @patch('accounts.views.mfa.send_email_code')
    def test_rejected_on_second_call_within_30_seconds(self, mock_send_email):
        mock_send_email.side_effect = lambda user, code: None
        request_data = {'purpose': 'enroll', 'method': 'email'}

        first = self.client.post(
            reverse('accounts:mfa-request-code'),
            request_data,
            format='json',
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(
            reverse('accounts:mfa-request-code'),
            request_data,
            format='json',
        )
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class SMSConsoleFallbackTests(APITestCase):
    def test_sms_logs_instead_of_raising_without_twilio(self):
        from ..services.delivery import send_sms_code

        logger = logging.getLogger('accounts.services.sms')
        logger.setLevel(logging.INFO)
        buffer = StringIO()
        handler = logging.StreamHandler(buffer)
        logger.addHandler(handler)
        try:
            send_sms_code('+18645551234', '123456')
        finally:
            logger.removeHandler(handler)

        output = buffer.getvalue()
        self.assertIn('console fallback', output)
        self.assertIn('+18645551234', output)
