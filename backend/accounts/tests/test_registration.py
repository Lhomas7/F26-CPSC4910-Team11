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

