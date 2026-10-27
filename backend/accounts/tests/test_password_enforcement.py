"""Every way a password is set enforces the policy and the reuse history."""

import pyotp
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AdminPasswordChangeForm
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..input_cleaning import password_requirements
from ..models import PasswordHistory, SponsorCompany
from ..password_validation import PASSWORD_HISTORY_DEPTH
from ..services.admin_password_reset import admin_token_generator
from ..services.crypto import decrypt_secret
from .common import enroll_totp

WEAK = 'weakpass'
FIRST = 'FirstPassword11!'
REUSED_MESSAGE = f"You can't reuse any of your last {PASSWORD_HISTORY_DEPTH} passwords."


def numbered_password(number):
    return f'RotatingPassword{number:02d}!'


class PasswordHistoryTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='history.user', password=FIRST)

    def change_to(self, password):
        validate_password(password, self.user)
        self.user.set_password(password)
        self.user.save()

    def assert_reuse_refused(self, password):
        with self.assertRaises(ValidationError) as caught:
            validate_password(password, self.user)
        self.assertIn(REUSED_MESSAGE, caught.exception.messages)

    def test_the_current_password_cannot_be_reused(self):
        self.assert_reuse_refused(FIRST)

    def test_the_last_five_passwords_cannot_be_reused(self):
        for number in range(1, PASSWORD_HISTORY_DEPTH):
            self.change_to(numbered_password(number))

        self.assert_reuse_refused(FIRST)
        for number in range(1, PASSWORD_HISTORY_DEPTH):
            self.assert_reuse_refused(numbered_password(number))

    def test_a_password_older_than_the_last_five_can_be_used_again(self):
        for number in range(1, PASSWORD_HISTORY_DEPTH + 1):
            self.change_to(numbered_password(number))

        validate_password(FIRST, self.user)

    def test_only_hashes_are_kept_and_history_is_pruned(self):
        for number in range(1, PASSWORD_HISTORY_DEPTH + 3):
            self.change_to(numbered_password(number))

        hashes = list(PasswordHistory.objects.filter(user=self.user))
        self.assertEqual(len(hashes), PASSWORD_HISTORY_DEPTH)
        self.assertEqual(hashes[0].password_hash, self.user.password)
        self.assertTrue(all('RotatingPassword' not in row.password_hash for row in hashes))

    def test_accounts_created_before_history_still_protect_the_current_password(self):
        PasswordHistory.objects.all().delete()

        self.assert_reuse_refused(FIRST)

    def test_new_accounts_have_no_history_to_check(self):
        validate_password(FIRST, get_user_model()(username='brand.new'))

    def test_the_reuse_rule_is_published(self):
        self.assertIn(
            f'Must not match any of your last {PASSWORD_HISTORY_DEPTH} passwords',
            password_requirements(),
        )


class PasswordPathEnforcementTests(APITestCase):
    """Weak and reused passwords are refused on every route that sets one."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.driver_user = User.objects.create_user(
            username='path.driver', email='path.driver@example.com', password=FIRST
        )
        Driver.objects.create(user=cls.driver_user, name='Path Driver')
        cls.admin = User.objects.create_superuser(
            username='path.admin', email='path.admin@example.com', password=FIRST
        )
        cls.admin_mfa = enroll_totp(cls.admin)
        cls.company = SponsorCompany.objects.create(name='Path Freight')

    def assert_password_refused(self, response, message=None):
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn('password', response.data)
        if message:
            self.assertIn(message, response.data['password'])

    def registration(self, **overrides):
        data = {
            'first_name': 'Path',
            'last_name': 'Person',
            'email': 'new.person@example.com',
            'username': 'new.person',
            'password': WEAK,
            'password_confirm': WEAK,
            'accepted_terms': True,
            'company_name': 'Path Freight',
        }
        data.update(overrides)
        return data

    def test_driver_and_sponsor_registration(self):
        for name in ('accounts:driver-register', 'accounts:sponsor-register'):
            with self.subTest(route=name):
                self.assert_password_refused(
                    self.client.post(reverse(name), self.registration(), format='json')
                )
        self.assertFalse(get_user_model().objects.filter(username='new.person').exists())

    def test_changing_your_own_password(self):
        self.client.force_authenticate(self.driver_user)
        for password, message in ((WEAK, None), (FIRST, REUSED_MESSAGE)):
            with self.subTest(password=password):
                response = self.client.post(
                    reverse('accounts:change-password'),
                    {'current_password': FIRST, 'password': password, 'password_confirm': password},
                    format='json',
                )
                self.assert_password_refused(response, message)

    def test_forgot_password_reset(self):
        uid = urlsafe_base64_encode(force_bytes(self.driver_user.pk))
        token = default_token_generator.make_token(self.driver_user)
        for password, message in ((WEAK, None), (FIRST, REUSED_MESSAGE)):
            with self.subTest(password=password):
                response = self.client.post(
                    reverse('accounts:password-reset-confirm'),
                    {
                        'uid': uid,
                        'token': token,
                        'password': password,
                        'password_confirm': password,
                    },
                    format='json',
                )
                self.assert_password_refused(response, message)

    def test_admin_reset_link(self):
        uid = urlsafe_base64_encode(force_bytes(self.admin.pk))
        token = admin_token_generator.make_token(self.admin)
        totp = pyotp.TOTP(decrypt_secret(self.admin_mfa.totp_secret_encrypted))
        for password, message in ((WEAK, None), (FIRST, REUSED_MESSAGE)):
            with self.subTest(password=password):
                response = self.client.post(
                    reverse('accounts:admin-password-reset-confirm'),
                    {
                        'uid': uid,
                        'token': token,
                        'method': 'totp',
                        'code': totp.now(),
                        'password': password,
                        'password_confirm': password,
                    },
                    format='json',
                )
                self.assert_password_refused(response, message)

    def test_admin_creating_an_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('accounts:admin-user-list'),
            {
                'first_name': 'Path',
                'last_name': 'Person',
                'username': 'new.person',
                'email': 'new.person@example.com',
                'role': 'driver',
                'sponsor_org_id': self.company.pk,
                'password': WEAK,
                'password_confirm': WEAK,
            },
            format='json',
        )

        self.assert_password_refused(response)

    def test_django_admin_password_form(self):
        for password in (WEAK, FIRST):
            with self.subTest(password=password):
                form = AdminPasswordChangeForm(
                    self.driver_user, {'password1': password, 'password2': password}
                )
                self.assertFalse(form.is_valid())

    def test_nothing_was_changed_by_any_refused_attempt(self):
        self.test_changing_your_own_password()
        self.test_forgot_password_reset()

        self.driver_user.refresh_from_db()
        self.assertTrue(self.driver_user.check_password(FIRST))


class AdminReauthenticationTests(APITestCase):
    """Creating an admin or deactivating an account needs the admin's password."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_superuser(username='reauth.admin', password=FIRST)
        enroll_totp(cls.admin)
        cls.other_admin = User.objects.create_superuser(username='reauth.other', password=FIRST)
        cls.driver_user = User.objects.create_user(username='reauth.driver', password=FIRST)
        Driver.objects.create(user=cls.driver_user, name='Reauth Driver')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def create(self, role, **extra):
        return self.client.post(
            reverse('accounts:admin-user-list'),
            {
                'first_name': 'New',
                'last_name': 'Person',
                'username': f'new.{role}',
                'email': f'new.{role}@example.com',
                'role': role,
                'password': 'ValidSecurePassword22!',
                'password_confirm': 'ValidSecurePassword22!',
                **extra,
            },
            format='json',
        )

    def test_creating_an_admin_needs_the_current_password(self):
        for current_password in (None, 'WrongPassword11!'):
            with self.subTest(current_password=current_password):
                extra = {'current_password': current_password} if current_password else {}
                response = self.create('admin', **extra)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('current_password', response.data)
        self.assertFalse(get_user_model().objects.filter(username='new.admin').exists())

        self.assertEqual(
            self.create('admin', current_password=FIRST).status_code, status.HTTP_201_CREATED
        )

    def test_creating_a_driver_does_not_ask_for_it(self):
        self.assertEqual(self.create('driver').status_code, status.HTTP_201_CREATED)

    def test_deactivating_needs_the_current_password(self):
        routes = (
            ('accounts:admin-account-detail', self.other_admin),
            ('accounts:admin-driver-detail', self.driver_user),
        )
        for name, target in routes:
            with self.subTest(route=name):
                url = reverse(name, kwargs={'user_id': target.pk})
                refused = self.client.patch(url, {'is_active': False}, format='json')
                self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('current_password', refused.data)
                target.refresh_from_db()
                self.assertTrue(target.is_active)

                allowed = self.client.patch(
                    url, {'is_active': False, 'current_password': FIRST}, format='json'
                )
                self.assertEqual(allowed.status_code, status.HTTP_200_OK)
                target.refresh_from_db()
                self.assertFalse(target.is_active)

    def test_other_edits_and_reactivation_do_not_ask_for_it(self):
        url = reverse('accounts:admin-driver-detail', kwargs={'user_id': self.driver_user.pk})

        self.assertEqual(
            self.client.patch(url, {'display_name': 'Renamed'}, format='json').status_code,
            status.HTTP_200_OK,
        )
        self.driver_user.is_active = False
        self.driver_user.save(update_fields=['is_active'])
        self.assertEqual(
            self.client.patch(url, {'is_active': True}, format='json').status_code,
            status.HTTP_200_OK,
        )
