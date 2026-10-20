import re
import threading
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core import mail
from django.core.cache import cache
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.views.debug import ExceptionReporter
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import (
    AdminImpersonationEvent,
    DriverNotification,
    LoginAttempt,
    MFASettings,
    SponsorAccount,
    SponsorCompany,
)
from ..services.mfa import create_mfa_code
from ..views import LoginView
from ..views.authentication import (
    PASSWORD_RESET_INVALID_LINK_MESSAGE,
    PASSWORD_RESET_REQUEST_MESSAGE,
)
from .common import enroll_totp, send_reset_emails_inline


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

    def test_reports_every_unmet_requirement_and_no_met_ones(self):
        response = self.client.post(
            self.url,
            {'password': 'abcdefghijklmn', 'password_confirm': 'abcdefghijklmn'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['password'],
            [
                'Password must contain at least two uppercase letters.',
                'Password must contain at least two numbers.',
                'Password must contain at least one approved symbol.',
            ],
        )

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
        self.assertEqual(attempt.user, self.user)
        self.assertTrue(attempt.successful)
        self.assertIsNotNone(attempt.timestamp)

    def test_wrong_password_is_recorded_as_failure(self):
        response = self.login(password='WrongPassword123!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'driver.one')
        self.assertEqual(attempt.user, self.user)
        self.assertFalse(attempt.successful)

    def test_wrong_password_with_different_case_is_linked_to_account(self):
        self.login(username='Driver.One', password='WrongPassword123!')

        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'Driver.One')
        self.assertEqual(attempt.user, self.user)
        self.assertFalse(attempt.successful)

    def test_unknown_username_is_recorded_as_failure(self):
        response = self.login(username='nobody.here')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.username, 'nobody.here')
        self.assertIsNone(attempt.user)
        self.assertFalse(attempt.successful)

    def test_unknown_username_and_wrong_password_get_identical_responses(self):
        unknown_user = self.login(username='nobody.here')
        wrong_password = self.login(password='WrongPassword123!')

        self.assertEqual(unknown_user.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(unknown_user.status_code, wrong_password.status_code)
        self.assertEqual(unknown_user.json(), wrong_password.json())
        self.assertEqual(unknown_user.json(), {'detail': 'Invalid username or password.'})

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
        self.assertEqual(attempt.user, self.user)
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
        self.assertEqual(attempt.user, self.user)
        self.assertFalse(attempt.successful)


class LogoutTests(APITestCase):
    """Logging out must end the session on the server and in the browser."""

    logout_url = reverse('accounts:logout')
    me_url = reverse('accounts:me')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.driver = User.objects.create_user(
            username='driver.one',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        Driver.objects.create(user=cls.driver, name='Driver One', status='approved')
        cls.admin = User.objects.create_superuser(
            username='admin.one',
            password='ExamplePassword123!',
            email='admin@example.com',
        )
        enroll_totp(cls.admin)
        cls.sponsor = User.objects.create_user(
            username='sponsor.one',
            password='ExamplePassword123!',
            email='sponsor@example.com',
        )
        SponsorAccount.objects.create(
            user=cls.sponsor,
            company=SponsorCompany.objects.create(name='Palmetto Freight'),
        )
        enroll_totp(cls.sponsor)

    def assert_logout_ends_session(self):
        session_key = self.client.cookies[settings.SESSION_COOKIE_NAME].value
        self.assertTrue(self.client.get(self.me_url).data['authenticated'])

        response = self.client.post(self.logout_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        cookie = response.cookies[settings.SESSION_COOKIE_NAME]
        self.assertEqual(cookie.value, '')
        self.assertEqual(cookie['max-age'], 0)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertFalse(Session.objects.filter(session_key=session_key).exists())
        self.assertFalse(self.client.get(self.me_url).data['authenticated'])

        # Someone who copied the old cookie cannot pick the session back up.
        replay = self.client_class()
        replay.cookies[settings.SESSION_COOKIE_NAME] = session_key
        self.assertFalse(replay.get(self.me_url).data['authenticated'])

    def test_driver_logout_ends_the_session(self):
        self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )
        self.assert_logout_ends_session()

    def test_admin_logout_ends_the_session(self):
        self.client.force_login(self.admin)
        self.assert_logout_ends_session()

    def test_sponsor_logout_ends_the_session(self):
        self.client.force_login(self.sponsor)
        self.assert_logout_ends_session()

    def test_logout_without_a_session_still_succeeds(self):
        response = self.client.post(self.logout_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_logout_while_viewing_as_a_driver_records_the_stop(self):
        self.client.force_login(self.admin)
        started = self.client.post(
            reverse('accounts:admin-impersonation-start', args=[self.driver.id]),
            {},
            format='json',
        )
        self.assertEqual(started.status_code, status.HTTP_200_OK)

        self.assert_logout_ends_session()

        stop = AdminImpersonationEvent.objects.get(action='stop')
        self.assertEqual(stop.admin, self.admin)
        self.assertEqual(stop.target, self.driver)
        self.assertEqual(stop.target_role, 'driver')

    def test_admin_logout_while_viewing_as_a_sponsor_records_the_stop(self):
        self.client.force_login(self.admin)
        started = self.client.post(
            reverse('accounts:admin-impersonation-start', args=[self.sponsor.id]),
            {},
            format='json',
        )
        self.assertEqual(started.status_code, status.HTTP_200_OK)

        self.assert_logout_ends_session()

        stop = AdminImpersonationEvent.objects.get(action='stop')
        self.assertEqual(stop.admin, self.admin)
        self.assertEqual(stop.target, self.sponsor)
        self.assertEqual(stop.target_role, 'sponsor')

    def test_me_response_is_not_cached(self):
        self.client.force_login(self.driver)

        response = self.client.get(self.me_url)

        self.assertIn('no-store', response['Cache-Control'])


class ErrorReportRedactionTests(SimpleTestCase):
    """A 500 on a credential endpoint must not put the password in Django's report."""

    def test_login_error_report_masks_the_password(self):
        secret = 'Sup3r-Secret-Pa55word!'
        request = RequestFactory().post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': secret},
        )

        with patch(
            'accounts.views.authentication.authenticate',
            side_effect=RuntimeError('database unavailable'),
        ):
            with self.assertRaises(RuntimeError) as raised:
                LoginView.as_view()(request)

        error = raised.exception
        report = ExceptionReporter(
            request, type(error), error, error.__traceback__
        ).get_traceback_html()

        self.assertNotIn(secret, report)
        self.assertIn('driver.one', report)
        self.assertIn('database unavailable', report)


class PasswordResetTests(APITestCase):
    request_url = reverse('accounts:password-reset')
    confirm_url = reverse('accounts:password-reset-confirm')
    new_password = 'ValidSecurePassword22!'

    def setUp(self):
        cache.clear()
        mail.outbox = []
        send_reset_emails_inline(self)
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
        'accounts.services.password_reset.send_password_reset_email',
        side_effect=RuntimeError('smtp down'),
    )
    def test_delivery_failure_does_not_change_the_response(self, _send):
        with self.assertLogs('accounts.services.password_reset', level='ERROR'):
            response = self.request_reset()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'detail': PASSWORD_RESET_REQUEST_MESSAGE})

    @patch('accounts.views.authentication.send_password_reset_emails_in_background')
    def test_known_and_unknown_addresses_take_the_same_delivery_path(self, send_in_background):
        self.request_reset()
        self.request_reset(email='nobody@example.com')

        self.assertEqual(
            [call.args[0] for call in send_in_background.call_args_list],
            [[self.user], []],
        )

    def test_confirm_sets_the_new_password(self):
        uid, token = self.issue_link()

        response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))

    def test_link_can_only_be_used_once(self):
        uid, token = self.issue_link()
        self.confirm(uid, token)
        mail.outbox = []

        response = self.confirm(uid, token, password='AnotherSecurePass33!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, {'detail': PASSWORD_RESET_INVALID_LINK_MESSAGE})
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))
        # Only the first, successful use notified the owner.
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(DriverNotification.objects.filter(driver=self.driver).count(), 1)

    def test_older_unused_link_stops_working_once_a_newer_one_is_used(self):
        old_uid, old_token = self.issue_link()
        cache.clear()  # Skip the request cooldown so a second link is sent.
        new_uid, new_token = self.issue_link()
        self.assertEqual(self.confirm(new_uid, new_token).status_code, status.HTTP_200_OK)

        response = self.confirm(old_uid, old_token, password='AnotherSecurePass33!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))

    def test_link_stops_working_after_the_owner_signs_in(self):
        uid, token = self.issue_link()
        self.client_class().post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )

        response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ExamplePassword123!'))

    def test_rejected_password_does_not_use_up_the_link(self):
        uid, token = self.issue_link()
        self.assertEqual(
            self.confirm(uid, token, password='short').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))

    def test_link_only_works_for_the_account_it_was_sent_to(self):
        other = get_user_model().objects.create_user(
            username='driver.two',
            email='two@example.com',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=other, name='Driver Two', status='approved')
        _uid, token = self.issue_link()
        other_uid = urlsafe_base64_encode(force_bytes(other.pk))

        response = self.confirm(other_uid, token)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        other.refresh_from_db()
        self.assertTrue(other.check_password('ExamplePassword123!'))

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

    def sign_in_browser(self, username='driver.one', password='ExamplePassword123!'):
        """Sign in through the real login endpoint in a separate browser."""
        browser = self.client_class()
        response = browser.post(
            reverse('accounts:login'),
            {'username': username, 'password': password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(browser.get(reverse('accounts:me')).data['authenticated'])
        return browser

    def assert_signed_out(self, browser):
        session_key = browser.cookies[settings.SESSION_COOKIE_NAME].value
        self.assertFalse(browser.get(reverse('accounts:me')).data['authenticated'])
        # The stale session is deleted server-side, not just ignored.
        self.assertFalse(Session.objects.filter(session_key=session_key).exists())
        response = browser.get(reverse('accounts:self-profile'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_every_browser_is_signed_out_after_reset(self):
        # e.g. the owner's phone and an attacker's laptop.
        first = self.sign_in_browser()
        second = self.sign_in_browser()
        uid, token = self.issue_link()

        self.confirm(uid, token)

        self.assert_signed_out(first)
        self.assert_signed_out(second)

    def test_sessions_that_completed_mfa_are_signed_out_after_reset(self):
        MFASettings.objects.create(user=self.user, email_enabled=True)
        browser = self.client_class()
        browser.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )
        raw_code = create_mfa_code(self.user, purpose='login', method='email')
        browser.post(
            reverse('accounts:login-mfa'), {'method': 'email', 'code': raw_code}, format='json'
        )
        self.assertTrue(browser.get(reverse('accounts:me')).data['authenticated'])
        uid, token = self.issue_link()

        self.confirm(uid, token)

        self.assert_signed_out(browser)

    def test_sponsor_sessions_are_signed_out_after_reset(self):
        sponsor = get_user_model().objects.create_user(
            username='sponsor.one',
            email='sponsor@example.com',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(
            user=sponsor, company=SponsorCompany.objects.create(name='Palmetto Freight')
        )
        browser = self.sign_in_browser(username='sponsor.one')
        self.request_reset(email='sponsor@example.com')
        uid, token = re.search(r'/reset-password/([^/\s]+)/([^/\s]+)', mail.outbox[0].body).groups()

        self.confirm(uid, token)

        self.assert_signed_out(browser)

    def test_other_accounts_stay_signed_in_after_reset(self):
        other = get_user_model().objects.create_user(
            username='driver.two',
            email='two@example.com',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=other, name='Driver Two', status='approved')
        browser = self.sign_in_browser(username='driver.two')
        uid, token = self.issue_link()

        self.confirm(uid, token)

        self.assertTrue(browser.get(reverse('accounts:me')).data['authenticated'])

    def test_only_the_new_password_signs_in_after_reset(self):
        old_browser = self.sign_in_browser()
        uid, token = self.issue_link()

        self.confirm(uid, token)

        self.assert_signed_out(old_browser)
        response = self.client.post(
            reverse('accounts:login'),
            {'username': 'driver.one', 'password': 'ExamplePassword123!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.sign_in_browser(password=self.new_password)

    def test_confirm_rejects_reusing_the_current_password(self):
        uid, token = self.issue_link()

        response = self.confirm(uid, token, password='ExamplePassword123!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ExamplePassword123!'))


class PasswordResetDeliveryTimingTests(APITestCase):
    """Uses a real thread: the response must not wait for the email to send."""

    def setUp(self):
        cache.clear()
        user = get_user_model().objects.create_user(
            username='driver.one',
            email='driver@example.com',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=user, name='Driver One', status='approved')

    def test_response_does_not_wait_for_email_delivery(self):
        started = threading.Event()
        release = threading.Event()

        def slow_send(_user):
            started.set()
            release.wait(5)

        with patch(
            'accounts.services.password_reset.send_password_reset_email',
            side_effect=slow_send,
        ):
            try:
                response = self.client.post(
                    reverse('accounts:password-reset'),
                    {'email': 'driver@example.com'},
                    format='json',
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertTrue(started.wait(5))
                # The email is still "sending" even though the response is back.
                self.assertFalse(release.is_set())
            finally:
                release.set()


class PasswordResetExcludesAdminsTests(APITestCase):
    request_url = reverse('accounts:password-reset')

    def setUp(self):
        cache.clear()
        mail.outbox = []
        send_reset_emails_inline(self)

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

        response = self.client.post(
            self.request_url, {'email': 'driver@example.com'}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
