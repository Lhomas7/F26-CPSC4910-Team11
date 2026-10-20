from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AdminPasswordChangeForm
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .. import input_cleaning
from ..input_cleaning import (
    PASSWORD_IDENTITY_REQUIREMENT,
    PASSWORD_RULES,
    PASSWORD_SPECIAL_CHARACTERS,
)
from ..password_validation import AccountPasswordPolicyValidator


def unsaved_user(username='', email=''):
    return get_user_model()(username=username, email=email)


class PasswordPolicyRulesTests(APITestCase):
    def assert_rejected_with(self, password, *messages, username='', email=''):
        with self.assertRaises(ValidationError) as caught:
            AccountPasswordPolicyValidator().validate(password, unsaved_user(username, email))
        self.assertEqual(caught.exception.messages, list(messages))

    def test_each_rule_keeps_its_specific_error(self):
        self.assert_rejected_with('abcdefAB12!', 'Password must be at least 12 characters long.')
        self.assert_rejected_with(
            'ABCDEFGHab12!', 'Password must contain at least three lowercase letters.'
        )
        self.assert_rejected_with(
            'abcdefghiA12!', 'Password must contain at least two uppercase letters.'
        )
        self.assert_rejected_with('abcdefghAB1!x', 'Password must contain at least two numbers.')
        self.assert_rejected_with(
            'abcdefghAB12x', 'Password must contain at least one approved symbol.'
        )

    def test_every_unmet_rule_is_reported_and_met_rules_are_not(self):
        # Meets the lowercase rule only.
        self.assert_rejected_with(
            'abc',
            'Password must be at least 12 characters long.',
            'Password must contain at least two uppercase letters.',
            'Password must contain at least two numbers.',
            'Password must contain at least one approved symbol.',
        )

    def test_unmet_rules_keep_the_order_users_read_them_in(self):
        with self.assertRaises(ValidationError) as caught:
            AccountPasswordPolicyValidator().validate('Ab1!', unsaved_user(username='ab1'))

        rule_messages = [message for _text, _check, message in PASSWORD_RULES]
        reported = caught.exception.messages
        self.assertEqual(reported[:-1], [m for m in rule_messages if m in reported])
        self.assertEqual(
            reported[-1], 'Password must not contain your username or email address.'
        )

    def test_identity_rule_still_applies(self):
        self.assert_rejected_with(
            'xxjordan.leeAB12!',
            'Password must not contain your username or email address.',
            username='Jordan.Lee',
        )

    def test_identity_rule_is_reported_with_the_other_unmet_rules(self):
        self.assert_rejected_with(
            'jordanlee',
            'Password must be at least 12 characters long.',
            'Password must contain at least two uppercase letters.',
            'Password must contain at least two numbers.',
            'Password must contain at least one approved symbol.',
            'Password must not contain your username or email address.',
            username='JordanLee',
        )

    def test_valid_password_passes(self):
        self.assertIsNone(AccountPasswordPolicyValidator().validate('abcdefAB12!x'))

    def test_policy_runs_with_djangos_validators_on_every_password_path(self):
        # validate_password is what the API serializers, the Django admin, and
        # createsuperuser/changepassword all call.
        with self.assertRaises(ValidationError) as caught:
            validate_password('password', unsaved_user(username='casey'))

        self.assertEqual(
            caught.exception.messages,
            [
                'Password must be at least 12 characters long.',
                'Password must contain at least two uppercase letters.',
                'Password must contain at least two numbers.',
                'Password must contain at least one approved symbol.',
                'This password is too common.',
            ],
        )

    def test_djangos_eight_character_minimum_is_not_reported_twice(self):
        with self.assertRaises(ValidationError) as caught:
            validate_password('Ab1!', unsaved_user())

        self.assertFalse(any('at least 8 characters' in m for m in caught.exception.messages))


class PasswordPolicyViewTests(APITestCase):
    url = reverse('accounts:password-policy')

    def test_anonymous_callers_get_every_requirement(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        requirements = response.data['requirements']
        for text, _check, _message in PASSWORD_RULES:
            self.assertIn(text, requirements)
        self.assertIn(PASSWORD_IDENTITY_REQUIREMENT, requirements)
        self.assertEqual(set(response.data['special_characters']), PASSWORD_SPECIAL_CHARACTERS)

    def test_django_validator_rules_are_listed_without_the_weaker_minimum(self):
        requirements = self.client.get(self.url).data['requirements']

        self.assertTrue(any('commonly used' in text for text in requirements))
        self.assertTrue(any('entirely numeric' in text for text in requirements))
        self.assertFalse(any('at least 8 characters' in text for text in requirements))

    def test_requirements_follow_the_rule_definitions(self):
        rules = PASSWORD_RULES + (('At least 1 emoji', lambda value: True, 'x'),)
        with patch.object(input_cleaning, 'PASSWORD_RULES', rules):
            requirements = self.client.get(self.url).data['requirements']

        self.assertIn('At least 1 emoji', requirements)


class DjangoAdminPasswordFormTests(APITestCase):
    """The Django admin's password forms enforce the same account policy."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='admin.target', password='ExamplePassword123!'
        )

    def test_admin_password_change_form_rejects_a_policy_violation(self):
        form = AdminPasswordChangeForm(
            self.user, {'password1': 'abcdefgh12!x', 'password2': 'abcdefgh12!x'}
        )

        self.assertFalse(form.is_valid())
        self.assertEqual(
            form.errors['password2'],
            ['Password must contain at least two uppercase letters.'],
        )

    def test_admin_password_change_form_accepts_a_compliant_password(self):
        form = AdminPasswordChangeForm(
            self.user, {'password1': 'ValidSecurePassword22!', 'password2': 'ValidSecurePassword22!'}
        )

        self.assertTrue(form.is_valid(), form.errors)
