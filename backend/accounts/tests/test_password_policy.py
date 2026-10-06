from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from .. import input_cleaning
from ..input_cleaning import (
    PASSWORD_IDENTITY_REQUIREMENT,
    PASSWORD_RULES,
    PASSWORD_SPECIAL_CHARACTERS,
    validate_password_policy,
)


class PasswordPolicyRulesTests(APITestCase):
    def assert_rejected_with(self, password, message, **identity):
        with self.assertRaises(ValidationError) as caught:
            validate_password_policy(password, **identity)
        self.assertEqual(caught.exception.detail, [message])

    def test_each_rule_keeps_its_specific_error(self):
        self.assert_rejected_with('Ab1!', 'Password must be at least 12 characters long.')
        self.assert_rejected_with(
            'ABCDEFGHab12!', 'Password must contain at least three lowercase letters.'
        )
        self.assert_rejected_with(
            'abcdefghiA12!', 'Password must contain at least two uppercase letters.'
        )
        self.assert_rejected_with(
            'abcdefghAB1!x', 'Password must contain at least two numbers.'
        )
        self.assert_rejected_with(
            'abcdefghAB12x', 'Password must contain at least one approved symbol.'
        )

    def test_identity_rule_still_applies(self):
        self.assert_rejected_with(
            'xxjordan.leeAB12!',
            'Password must not contain your username or email address.',
            username='Jordan.Lee',
        )

    def test_valid_password_passes(self):
        self.assertEqual(validate_password_policy('abcdefAB12!x'), 'abcdefAB12!x')


class PasswordPolicyViewTests(APITestCase):
    url = reverse('accounts:password-policy')

    def test_anonymous_callers_get_every_requirement(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        requirements = response.data['requirements']
        for text, _check, _message in PASSWORD_RULES:
            self.assertIn(text, requirements)
        self.assertIn(PASSWORD_IDENTITY_REQUIREMENT, requirements)
        self.assertEqual(
            set(response.data['special_characters']), PASSWORD_SPECIAL_CHARACTERS
        )

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
