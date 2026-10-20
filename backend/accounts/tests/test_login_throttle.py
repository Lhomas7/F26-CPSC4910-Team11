from datetime import timedelta

import pyotp
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import LoginAttempt, SponsorAccount, SponsorCompany
from ..services.crypto import decrypt_secret
from ..services.login_throttle import lockout_seconds_remaining
from .common import enroll_totp

PASSWORD = 'ExamplePassword123!'
WRONG = 'WrongPassword123!'
MAX_ATTEMPTS = 3


@override_settings(LOGIN_MAX_FAILED_ATTEMPTS=MAX_ATTEMPTS, LOGIN_LOCKOUT_MINUTES=15)
class LoginLockoutTests(APITestCase):
    login_url = reverse('accounts:login')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        company = SponsorCompany.objects.create(name='Lockout Freight')
        driver = User.objects.create_user(username='lock.driver', password=PASSWORD)
        Driver.objects.create(user=driver, name='Lock Driver', sponsor=company, status='approved')
        sponsor = User.objects.create_user(username='lock.sponsor', password=PASSWORD)
        SponsorAccount.objects.create(user=sponsor, company=company)
        User.objects.create_user(username='lock.admin', password=PASSWORD, is_staff=True)

    def sign_in(self, username, password=PASSWORD):
        return self.client.post(
            self.login_url, {'username': username, 'password': password}, format='json'
        )

    def fail(self, username, times=MAX_ATTEMPTS):
        for _ in range(times):
            response = self.sign_in(username, WRONG)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_every_account_type_is_locked_after_too_many_failures(self):
        for username in ('lock.driver', 'lock.sponsor', 'lock.admin'):
            with self.subTest(account=username):
                self.fail(username)

                # Even the correct password is refused while locked.
                response = self.sign_in(username)

                self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
                self.assertEqual(response.data['code'], 'login_locked')
                self.assertGreater(int(response['Retry-After']), 0)

    def test_fewer_failures_than_the_limit_do_not_lock(self):
        self.fail('lock.driver', MAX_ATTEMPTS - 1)

        self.assertEqual(self.sign_in('lock.driver').status_code, status.HTTP_200_OK)

    def test_unknown_usernames_lock_exactly_like_real_ones(self):
        self.fail('nobody.here')
        unknown = self.sign_in('nobody.here')
        self.fail('lock.driver')
        real = self.sign_in('lock.driver')

        self.assertEqual(unknown.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(unknown.status_code, real.status_code)
        self.assertEqual(set(unknown.data), set(real.data))

    def test_username_case_does_not_dodge_the_lock(self):
        self.fail('lock.driver', MAX_ATTEMPTS - 1)
        self.sign_in('LOCK.DRIVER', WRONG)

        self.assertEqual(self.sign_in('lock.driver').status_code, 429)

    def test_refused_attempts_are_not_recorded_so_the_lock_cannot_be_extended(self):
        self.fail('lock.driver')
        before = LoginAttempt.objects.count()

        for _ in range(5):
            self.sign_in('lock.driver', WRONG)

        self.assertEqual(LoginAttempt.objects.count(), before)

    def test_the_lock_lifts_once_the_failures_age_out(self):
        self.fail('lock.driver')
        self.assertGreater(lockout_seconds_remaining('lock.driver'), 0)

        LoginAttempt.objects.update(timestamp=timezone.now() - timedelta(minutes=16))

        self.assertEqual(lockout_seconds_remaining('lock.driver'), 0)
        self.assertEqual(self.sign_in('lock.driver').status_code, status.HTTP_200_OK)

    def test_a_successful_sign_in_clears_earlier_failures(self):
        self.fail('lock.driver', MAX_ATTEMPTS - 1)
        self.assertEqual(self.sign_in('lock.driver').status_code, status.HTTP_200_OK)
        self.client.post(reverse('accounts:logout'))

        self.fail('lock.driver', MAX_ATTEMPTS - 1)

        self.assertEqual(self.sign_in('lock.driver').status_code, status.HTTP_200_OK)

    def test_a_locked_username_cannot_finish_the_mfa_step(self):
        user = get_user_model().objects.get(username='lock.sponsor')
        mfa = enroll_totp(user)
        self.assertEqual(self.sign_in('lock.sponsor').status_code, status.HTTP_200_OK)
        code = pyotp.TOTP(decrypt_secret(mfa.totp_secret_encrypted)).now()
        for _ in range(MAX_ATTEMPTS):
            LoginAttempt.objects.create(username='lock.sponsor', user=user, successful=False)

        response = self.client.post(
            reverse('accounts:login-mfa'), {'method': 'totp', 'code': code}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(self.client.get(reverse('accounts:me')).data['authenticated'], False)

    def test_wrong_mfa_codes_count_toward_the_same_lock(self):
        user = get_user_model().objects.get(username='lock.sponsor')
        enroll_totp(user)
        for _ in range(MAX_ATTEMPTS):
            self.sign_in('lock.sponsor')
            self.client.post(
                reverse('accounts:login-mfa'), {'method': 'totp', 'code': '000000'}, format='json'
            )

        self.assertEqual(self.sign_in('lock.sponsor').status_code, 429)
