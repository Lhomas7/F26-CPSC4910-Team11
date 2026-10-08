from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import DriverNotification, MFASettings, TrustedDevice
from ..services.mfa import create_mfa_code
from .common import MailAssertMixin

PASSWORD = 'ExamplePassword123!'
COOKIE = settings.TRUSTED_DEVICE_COOKIE_NAME


class DeviceCheckTests(MailAssertMixin, APITestCase):
    login_url = reverse('accounts:login')
    logout_url = reverse('accounts:logout')
    me_url = reverse('accounts:me')
    check_url = reverse('accounts:device-check')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user(
            username='driver.one', password=PASSWORD, email='driver@example.com'
        )
        cls.driver = Driver.objects.create(user=cls.user, name='Driver One', status='approved')
        cls.other = User.objects.create_user(
            username='driver.two', password=PASSWORD, email='two@example.com'
        )
        Driver.objects.create(user=cls.other, name='Driver Two', status='approved')

    def setUp(self):
        cache.clear()

    def login(self, username='driver.one', password=PASSWORD):
        return self.client.post(
            self.login_url, {'username': username, 'password': password}, format='json'
        )

    def answer(self, trusted):
        return self.client.post(self.check_url, {'trusted': trusted}, format='json')

    def trust_this_browser(self, username='driver.one'):
        self.login(username)
        self.assertEqual(self.answer(True).status_code, status.HTTP_200_OK)
        self.client.post(self.logout_url)

    def test_first_sign_in_asks_about_the_device(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['session']['device_check'], 'new_device')
        # A reload must still show the question.
        me = self.client.get(self.me_url)
        self.assertEqual(me.data['user']['session']['device_check'], 'new_device')

    def test_yes_remembers_the_browser_with_an_httponly_cookie(self):
        self.login()

        response = self.answer(True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['session']['device_check'])
        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['max-age'], settings.TRUSTED_DEVICE_DAYS * 86400)
        self.assertEqual(self.client.session['device_mode'], 'trusted')

    def test_trusted_browser_is_not_asked_again(self):
        self.trust_this_browser()

        response = self.login()

        self.assertIsNone(response.data['session']['device_check'])
        self.assertEqual(self.client.session['device_mode'], 'trusted')

    def test_only_the_token_hash_is_stored(self):
        self.login()
        token = self.answer(True).cookies[COOKIE].value

        device = TrustedDevice.objects.get(user=self.user)
        self.assertNotEqual(device.token_hash, token)
        self.assertEqual(len(device.token_hash), 64)
        self.assertNotIn(token, str(list(TrustedDevice.objects.values())))

    def test_trust_expires(self):
        self.trust_this_browser()
        TrustedDevice.objects.update(
            created_at=timezone.now() - timedelta(days=settings.TRUSTED_DEVICE_DAYS + 1)
        )

        response = self.login()

        self.assertEqual(response.data['session']['device_check'], 'new_device')

    def test_trust_is_per_account(self):
        self.trust_this_browser('driver.one')

        response = self.login('driver.two')

        self.assertEqual(response.data['session']['device_check'], 'new_device')

    def test_recent_failures_trigger_the_question_even_on_a_trusted_browser(self):
        self.trust_this_browser()
        for _ in range(settings.SUSPICIOUS_FAILURE_THRESHOLD):
            self.login(password='WrongPassword123!')

        response = self.login()

        self.assertEqual(response.data['session']['device_check'], 'recent_failures')

    def test_failures_before_the_last_success_are_not_counted_again(self):
        self.trust_this_browser()
        for _ in range(settings.SUSPICIOUS_FAILURE_THRESHOLD):
            self.login(password='WrongPassword123!')
        self.login()
        self.answer(True)
        self.client.post(self.logout_url)

        response = self.login()

        self.assertIsNone(response.data['session']['device_check'])

    def test_fewer_failures_than_the_threshold_do_not_trigger_it(self):
        self.trust_this_browser()
        for _ in range(settings.SUSPICIOUS_FAILURE_THRESHOLD - 1):
            self.login(password='WrongPassword123!')

        response = self.login()

        self.assertIsNone(response.data['session']['device_check'])

    def test_no_makes_a_shared_session_and_notifies_the_owner(self):
        self.login()

        with self.assertSendsMail(1):
            response = self.answer(False)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(COOKIE, response.cookies)
        self.assertFalse(TrustedDevice.objects.exists())
        self.assertTrue(self.client.session.get_expire_at_browser_close())
        self.assertEqual(self.client.session['device_mode'], 'shared')
        self.assertEqual(mail.outbox[0].to, ['driver@example.com'])
        self.assertTrue(DriverNotification.objects.filter(driver=self.driver).exists())

    def test_shared_browser_is_asked_again_next_time(self):
        self.login()
        self.answer(False)
        self.client.post(self.logout_url)

        response = self.login()

        self.assertEqual(response.data['session']['device_check'], 'new_device')

    def test_answer_requires_a_signed_in_user(self):
        response = self.answer(True)

        self.assertIn(
            response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )

    def test_answer_requires_a_pending_question(self):
        self.trust_this_browser()
        self.login()

        response = self.answer(True)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_question_can_only_be_answered_once(self):
        self.login()
        self.answer(False)

        response = self.answer(True)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(TrustedDevice.objects.exists())

    def test_answer_must_be_a_boolean(self):
        self.login()

        response = self.client.post(self.check_url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.session['device_check'], 'new_device')

    def test_mfa_sign_in_also_asks_about_the_device(self):
        MFASettings.objects.create(user=self.user, email_enabled=True)
        self.login()
        raw_code = create_mfa_code(self.user, purpose='login', method='email')

        response = self.client.post(
            reverse('accounts:login-mfa'), {'method': 'email', 'code': raw_code}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['session']['device_check'], 'new_device')

    def test_password_reset_forgets_trusted_browsers(self):
        self.trust_this_browser()
        # The reset token covers last_login, which signing in just changed.
        self.user.refresh_from_db()
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        new_password = 'ValidSecurePassword22!'

        response = self.client.post(
            reverse('accounts:password-reset-confirm'),
            {
                'uid': uid,
                'token': token,
                'password': new_password,
                'password_confirm': new_password,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(TrustedDevice.objects.filter(user=self.user).exists())
        self.assertEqual(
            self.login(password=new_password).data['session']['device_check'], 'new_device'
        )
