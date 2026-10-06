from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from ..models import RegistrationEmailCode, RegistrationSettings
from ..services.mfa import MAX_ATTEMPTS
from ..services.registration_verification import (
    create_registration_code,
    verify_registration_code,
)


class RegistrationSettingsTests(TestCase):
    def test_load_creates_single_row_with_verification_off(self):
        settings_row = RegistrationSettings.load()
        self.assertFalse(settings_row.email_verification_required)
        self.assertEqual(RegistrationSettings.load().pk, settings_row.pk)
        self.assertEqual(RegistrationSettings.objects.count(), 1)


class RegistrationCodeServiceTests(TestCase):
    email = 'new.driver@example.com'

    def test_stores_only_a_hash(self):
        raw = create_registration_code(self.email)
        row = RegistrationEmailCode.objects.get()
        self.assertEqual(len(raw), 6)
        self.assertNotEqual(row.code_hash, raw)

    def test_correct_code_verifies_once(self):
        raw = create_registration_code(self.email)
        self.assertTrue(verify_registration_code(self.email, raw))
        self.assertFalse(verify_registration_code(self.email, raw))

    def test_email_match_is_case_insensitive(self):
        raw = create_registration_code(self.email)
        self.assertTrue(verify_registration_code(self.email.upper(), raw))

    def test_code_is_bound_to_its_email(self):
        raw = create_registration_code(self.email)
        self.assertFalse(verify_registration_code('other@example.com', raw))
        self.assertTrue(verify_registration_code(self.email, raw))

    def test_new_code_retires_previous_one(self):
        first = create_registration_code(self.email)
        second = create_registration_code(self.email)
        if first != second:
            self.assertFalse(verify_registration_code(self.email, first))
        self.assertTrue(verify_registration_code(self.email, second))

    def test_expired_code_is_rejected(self):
        raw = create_registration_code(self.email)
        RegistrationEmailCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertFalse(verify_registration_code(self.email, raw))

    def test_code_is_invalidated_after_max_wrong_attempts(self):
        raw = create_registration_code(self.email)
        wrong = '000000' if raw != '000000' else '111111'
        for _ in range(MAX_ATTEMPTS):
            self.assertFalse(verify_registration_code(self.email, wrong))
        self.assertFalse(verify_registration_code(self.email, raw))

    def test_blank_code_is_rejected_without_counting_an_attempt(self):
        create_registration_code(self.email)
        self.assertFalse(verify_registration_code(self.email, ''))
        self.assertEqual(RegistrationEmailCode.objects.get().attempts, 0)
