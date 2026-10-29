import re

import pyotp
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import AdminPasswordResetEvent, LoginAttempt, MFABackupCode
from ..services.admin_password_reset import admin_token_generator
from ..services.crypto import decrypt_secret
from ..services.mfa import generate_backup_codes
from .common import enroll_totp

PASSWORD = 'ExamplePassword123!'
NEW_PASSWORD = 'BrandNewSecure44!'
LINK_PATTERN = re.compile(r'/admin-reset-password/([^/\s]+)/([^/\s]+)')


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class AdminPasswordResetTests(APITestCase):
    confirm_url = reverse('accounts:admin-password-reset-confirm')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.requester = User.objects.create_user(
            username='reset.requester',
            email='requester@example.com',
            password=PASSWORD,
            is_staff=True,
        )
        enroll_totp(cls.requester)
        cls.target = User.objects.create_user(
            username='reset.target',
            email='target@example.com',
            password=PASSWORD,
            is_staff=True,
        )
        cls.target_mfa = enroll_totp(cls.target)
        cls.driver = User.objects.create_user(
            username='reset.driver', email='driver@example.com', password=PASSWORD
        )
        Driver.objects.create(user=cls.driver, name='Reset Driver')

    def setUp(self):
        mail.outbox = []

    # --- helpers ---------------------------------------------------------

    def request_url(self, user=None):
        return reverse(
            'accounts:admin-password-reset-request',
            kwargs={'user_id': (user or self.target).pk},
        )

    def request_reset(self, user=None, password=PASSWORD, as_user=None):
        self.client.force_authenticate(as_user or self.requester)
        return self.client.post(
            self.request_url(user), {'current_password': password}, format='json'
        )

    def emailed_link(self):
        self.assertEqual(len(mail.outbox), 1)
        match = LINK_PATTERN.search(mail.outbox[0].body)
        self.assertIsNotNone(match)
        return match.group(1), match.group(2)

    def totp_now(self):
        return pyotp.TOTP(decrypt_secret(self.target_mfa.totp_secret_encrypted)).now()

    def confirm(self, uid, token, **overrides):
        payload = {
            'uid': uid,
            'token': token,
            'method': 'totp',
            'code': self.totp_now(),
            'password': NEW_PASSWORD,
            'password_confirm': NEW_PASSWORD,
        }
        payload.update(overrides)
        self.client.force_authenticate(None)
        return self.client.post(self.confirm_url, payload, format='json')

    def fresh_link(self):
        self.request_reset()
        link = self.emailed_link()
        mail.outbox = []
        return link

    def target_password_works(self, password):
        self.target.refresh_from_db()
        return self.target.check_password(password)

    # --- starting a reset ------------------------------------------------

    def test_an_admin_can_send_another_admin_a_link_that_is_never_shown_to_them(self):
        response = self.request_reset()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('reset-password', str(response.data))
        self.assertNotIn('target@example.com', str(response.data))
        self.assertEqual(mail.outbox[0].to, ['target@example.com'])
        self.assertIn('reset.requester', mail.outbox[0].body)
        event = AdminPasswordResetEvent.objects.get()
        self.assertEqual(
            (event.target, event.requested_by, event.action),
            (self.target, self.requester, 'requested'),
        )

    def test_only_enrolled_admins_can_start_one(self):
        unenrolled = get_user_model().objects.create_user(
            username='reset.unenrolled', password=PASSWORD, is_staff=True
        )
        self.client.force_authenticate(None)
        anonymous = self.client.post(self.request_url(), {'current_password': PASSWORD})

        self.assertEqual(anonymous.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.request_reset(as_user=self.driver).status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(
            self.request_reset(as_user=unenrolled).status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(mail.outbox, [])

    def test_the_requesters_own_password_is_required(self):
        response = self.request_reset(password='NotMyPassword123!')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mail.outbox, [])
        self.assertEqual(
            LoginAttempt.objects.filter(username='reset.requester', successful=False).count(), 1
        )

    def test_an_admin_cannot_reset_themselves_or_a_non_admin_this_way(self):
        self.assertEqual(
            self.request_reset(user=self.requester).status_code, status.HTTP_404_NOT_FOUND
        )
        self.assertEqual(
            self.request_reset(user=self.driver).status_code, status.HTTP_404_NOT_FOUND
        )
        self.assertEqual(mail.outbox, [])

    def test_an_admin_without_an_authenticator_cannot_be_sent_a_link(self):
        bare = get_user_model().objects.create_user(
            username='reset.bare', email='bare@example.com', password=PASSWORD, is_staff=True
        )

        response = self.request_reset(user=bare)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mail.outbox, [])

    def test_links_to_the_same_admin_are_rate_limited(self):
        self.assertEqual(self.request_reset().status_code, status.HTTP_200_OK)

        second = self.request_reset()

        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(len(mail.outbox), 1)

    # --- finishing a reset -----------------------------------------------

    def test_link_plus_authenticator_code_resets_the_password(self):
        uid, token = self.fresh_link()

        response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.target_password_works(NEW_PASSWORD))
        self.assertFalse(self.target_password_works(PASSWORD))
        self.assertTrue(
            AdminPasswordResetEvent.objects.filter(target=self.target, action='completed').exists()
        )
        self.assertEqual(mail.outbox[-1].to, ['target@example.com'])

    def test_the_link_alone_is_not_enough(self):
        uid, token = self.fresh_link()

        response = self.confirm(uid, token, code='000000')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('code', response.data)
        self.assertTrue(self.target_password_works(PASSWORD))
        self.assertTrue(
            AdminPasswordResetEvent.objects.filter(target=self.target, action='failed').exists()
        )
        # Wrong codes count toward the sign-in lockout too.
        self.assertEqual(
            LoginAttempt.objects.filter(username='reset.target', successful=False).count(), 1
        )

    def test_a_wrong_code_reveals_nothing_about_the_current_password(self):
        uid, token = self.fresh_link()

        response = self.confirm(
            uid, token, code='000000', password=PASSWORD, password_confirm=PASSWORD
        )

        self.assertEqual(set(response.data), {'code'})

    def test_guessing_codes_hits_the_lockout(self):
        uid, token = self.fresh_link()
        for _ in range(5):
            self.confirm(uid, token, code='000000')

        response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertTrue(self.target_password_works(PASSWORD))

    def test_the_link_works_only_once(self):
        uid, token = self.fresh_link()
        self.assertEqual(self.confirm(uid, token).status_code, status.HTTP_200_OK)

        again = self.confirm(
            uid, token, password='AnotherSecure55!', password_confirm='AnotherSecure55!'
        )

        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.target_password_works(NEW_PASSWORD))

    def test_an_expired_link_is_refused(self):
        uid, token = self.fresh_link()

        with override_settings(ADMIN_PASSWORD_RESET_TIMEOUT=-1):
            response = self.confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.target_password_works(PASSWORD))

    def test_an_ordinary_reset_token_does_not_open_the_admin_flow(self):
        uid = urlsafe_base64_encode(force_bytes(self.target.pk))
        ordinary = default_token_generator.make_token(self.target)

        response = self.confirm(uid, ordinary)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.target_password_works(PASSWORD))

    def test_an_admin_link_does_not_open_the_ordinary_flow(self):
        uid, token = self.fresh_link()
        self.client.force_authenticate(None)

        response = self.client.post(
            reverse('accounts:password-reset-confirm'),
            {
                'uid': uid,
                'token': token,
                'password': NEW_PASSWORD,
                'password_confirm': NEW_PASSWORD,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.target_password_works(PASSWORD))

    def test_the_ordinary_flow_refuses_admins_even_with_a_valid_ordinary_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.target.pk))
        self.client.force_authenticate(None)

        response = self.client.post(
            reverse('accounts:password-reset-confirm'),
            {
                'uid': uid,
                'token': default_token_generator.make_token(self.target),
                'password': NEW_PASSWORD,
                'password_confirm': NEW_PASSWORD,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.target_password_works(PASSWORD))

    def test_an_admin_token_for_a_non_admin_is_refused(self):
        uid = urlsafe_base64_encode(force_bytes(self.driver.pk))

        response = self.confirm(uid, admin_token_generator.make_token(self.driver))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_backup_code_can_finish_the_reset_once(self):
        codes = generate_backup_codes(self.target)
        uid, token = self.fresh_link()

        response = self.confirm(uid, token, method='backup', code=codes[0])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            MFABackupCode.objects.filter(user=self.target, used_at__isnull=False).count(), 1
        )

    def test_a_backup_code_is_not_spent_if_the_new_password_is_rejected(self):
        codes = generate_backup_codes(self.target)
        uid, token = self.fresh_link()

        response = self.confirm(
            uid, token, method='backup', code=codes[0], password=PASSWORD, password_confirm=PASSWORD
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            MFABackupCode.objects.filter(user=self.target, used_at__isnull=False).count(), 0
        )

    def test_the_new_password_must_meet_the_password_policy(self):
        uid, token = self.fresh_link()

        response = self.confirm(uid, token, password='short', password_confirm='short')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.target_password_works(PASSWORD))
