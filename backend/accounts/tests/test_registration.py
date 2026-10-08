import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import (
    RegistrationEmailCode,
    RegistrationSettings,
    SponsorAccount,
)
from ..services.mfa import MAX_ATTEMPTS


class RegistrationTests(APITestCase):
    driver_url = reverse('accounts:driver-register')
    sponsor_url = reverse('accounts:sponsor-register')

    def registration_data(self, **overrides):
        data = {
            'first_name': 'Jamie',
            'last_name': 'Rivera',
            'email': 'jamie@example.com',
            'username': 'jamie.rivera',
            'password': 'ExamplePassword123!',
            'password_confirm': 'ExamplePassword123!',
            'accepted_terms': True,
        }
        data.update(overrides)
        return data

    def test_driver_registration_stores_name_and_email(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='jamie.rivera')
        self.assertEqual(user.first_name, 'Jamie')
        self.assertEqual(user.last_name, 'Rivera')
        self.assertEqual(user.email, 'jamie@example.com')
        self.assertEqual(user.driver_profile.name, 'Jamie Rivera')

    def test_sponsor_registration_stores_name_email_and_company(self):
        data = self.registration_data(
            username='sponsor.user',
            email='sponsor@example.com',
            company_name='Palmetto Freight',
        )

        response = self.client.post(self.sponsor_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='sponsor.user')
        self.assertEqual(user.get_full_name(), 'Jamie Rivera')
        self.assertEqual(user.email, 'sponsor@example.com')
        self.assertEqual(user.sponsor_account.company.name, 'Palmetto Freight')

    def test_sponsor_registration_establishes_authenticated_session(self):
        data = self.registration_data(
            username='sponsor.user',
            email='sponsor@example.com',
            company_name='Palmetto Freight',
        )

        response = self.client.post(self.sponsor_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('mfa', response.data)
        self.assertEqual(response.data['mfa']['enrolled'], False)

        me = self.client.get(reverse('accounts:me'))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['authenticated'], True)
        self.assertEqual(me.data['user']['account_type'], 'sponsor')

    def test_registration_rejects_duplicate_email_case_insensitively(self):
        get_user_model().objects.create_user(
            username='existing.user',
            email='jamie@example.com',
        )

        response = self.client.post(
            self.driver_url,
            self.registration_data(email='JAMIE@EXAMPLE.COM'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['email'][0],
            'A user with this email address already exists.',
        )

    def test_registration_requires_each_name_and_email_field(self):
        for field in ('first_name', 'last_name', 'email'):
            data = self.registration_data()
            del data[field]

            response = self.client.post(self.driver_url, data, format='json')

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(field, response.data)

    def test_registration_canonicalizes_user_entered_text(self):
        response = self.client.post(
            self.sponsor_url,
            self.registration_data(
                first_name='  Jamie\t  Lynn ',
                last_name=' Rivera  ',
                email='  JAMIE@EXAMPLE.COM ',
                username='  ｊａｍｉｅ.rivera  ',
                company_name='  Palmetto\n  Freight  ',
            ),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='jamie.rivera')
        self.assertEqual(user.first_name, 'Jamie Lynn')
        self.assertEqual(user.last_name, 'Rivera')
        self.assertEqual(user.email, 'jamie@example.com')
        self.assertEqual(user.sponsor_account.company.name, 'Palmetto Freight')

    def test_registration_rejects_invisible_control_characters(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(first_name='Jam\u200bie'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['first_name'][0],
            'Control characters are not allowed.',
        )

    def test_registration_enforces_shared_username_format(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(username='jamie rivera'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_password_whitespace_is_not_silently_removed(self):
        password = ' ExamplePassword123! '
        response = self.client.post(
            self.driver_url,
            self.registration_data(password=password, password_confirm=password),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='jamie.rivera')
        self.assertTrue(user.check_password(password))
        self.assertFalse(user.check_password(password.strip()))

    def test_registration_accepts_accented_and_separated_names(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(first_name='José', last_name="O'Brien-Smith"),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_registration_rejects_repeated_name_separators(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(last_name='Smith--Jones'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('last_name', response.data)

    def test_registration_rejects_reserved_username(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(username='admin'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['username'][0], 'Choose a different username.')

    def test_registration_rejects_password_confirmation_mismatch(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(password_confirm='DifferentPassword456!'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['password_confirm'][0], 'Passwords do not match.')

    def test_registration_requires_terms_acceptance(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(accepted_terms=False),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('accepted_terms', response.data)

    def test_registration_returns_specific_password_policy_error(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(
                password='EXAMPLEPASSWORD12!',
                password_confirm='EXAMPLEPASSWORD12!',
            ),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['password'][0],
            'Password must contain at least three lowercase letters.',
        )


class RegistrationEmailVerificationTests(APITestCase):
    driver_url = reverse('accounts:driver-register')
    sponsor_url = reverse('accounts:sponsor-register')

    def setUp(self):
        cache.clear()
        mail.outbox = []
        settings_row = RegistrationSettings.load()
        settings_row.email_verification_required = True
        settings_row.save()

    def registration_data(self, **overrides):
        data = {
            'first_name': 'Jamie',
            'last_name': 'Rivera',
            'email': 'jamie@example.com',
            'username': 'jamie.rivera',
            'password': 'ExamplePassword123!',
            'password_confirm': 'ExamplePassword123!',
            'accepted_terms': True,
        }
        data.update(overrides)
        return data

    def sent_code(self):
        self.assertEqual(len(mail.outbox), 1)
        return re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    def request_code(self, url=None, **overrides):
        response = self.client.post(
            url or self.driver_url, self.registration_data(**overrides), format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        return self.sent_code()

    def test_verification_off_creates_account_immediately(self):
        RegistrationSettings.objects.update(email_verification_required=False)

        response = self.client.post(self.driver_url, self.registration_data(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 0)

    def test_first_submission_emails_code_without_creating_account(self):
        response = self.client.post(self.driver_url, self.registration_data(), format='json')

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(response.data['verification_required'])
        self.assertEqual(response.data['email'], 'jamie@example.com')
        self.assertEqual(mail.outbox[0].to, ['jamie@example.com'])
        self.assertNotIn(self.sent_code(), str(response.data))
        self.assertFalse(get_user_model().objects.filter(username='jamie.rivera').exists())

    def test_invalid_details_are_rejected_before_a_code_is_sent(self):
        response = self.client.post(
            self.driver_url,
            self.registration_data(password_confirm='Mismatch123!'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)

    def test_correct_code_creates_driver_account(self):
        code = self.request_code()

        response = self.client.post(
            self.driver_url, self.registration_data(code=code), format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='jamie.rivera')
        self.assertEqual(user.email, 'jamie@example.com')
        self.assertTrue(hasattr(user, 'driver_profile'))

    def test_code_cannot_be_reused(self):
        code = self.request_code()
        self.client.post(self.driver_url, self.registration_data(code=code), format='json')

        response = self.client.post(
            self.driver_url,
            self.registration_data(code=code, username='jamie.two', email='jamie@example.com'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_wrong_code_is_rejected(self):
        code = self.request_code()
        wrong = '000000' if code != '000000' else '111111'

        response = self.client.post(
            self.driver_url, self.registration_data(code=wrong), format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('code', response.data)
        self.assertFalse(get_user_model().objects.exists())

    def test_code_locks_after_too_many_wrong_attempts(self):
        code = self.request_code()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(MAX_ATTEMPTS):
            self.client.post(self.driver_url, self.registration_data(code=wrong), format='json')

        response = self.client.post(
            self.driver_url, self.registration_data(code=code), format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(get_user_model().objects.exists())

    def test_expired_code_is_rejected(self):
        code = self.request_code()
        RegistrationEmailCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

        response = self.client.post(
            self.driver_url, self.registration_data(code=code), format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_code_only_verifies_the_email_it_was_sent_to(self):
        code = self.request_code()

        response = self.client.post(
            self.driver_url,
            self.registration_data(code=code, email='someone.else@example.com'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(get_user_model().objects.exists())

    def test_resend_within_cooldown_is_throttled(self):
        self.request_code()

        response = self.client.post(self.driver_url, self.registration_data(), format='json')

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(len(mail.outbox), 1)

    def test_resend_after_cooldown_replaces_previous_code(self):
        first = self.request_code()
        cache.clear()
        mail.outbox = []
        second = self.request_code()

        if first != second:
            response = self.client.post(
                self.driver_url, self.registration_data(code=first), format='json'
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            self.driver_url, self.registration_data(code=second), format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_verified_sponsor_is_created_and_signed_in(self):
        sponsor = {
            'username': 'sponsor.user',
            'email': 'sponsor@example.com',
            'company_name': 'Palmetto Freight',
        }
        code = self.request_code(self.sponsor_url, **sponsor)

        response = self.client.post(
            self.sponsor_url, self.registration_data(code=code, **sponsor), format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(SponsorAccount.objects.filter(user__username='sponsor.user').exists())
        me = self.client.get(reverse('accounts:me'))
        self.assertEqual(me.data['authenticated'], True)
