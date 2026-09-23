"""Canonical input fields shared by account serializers.

These helpers normalize representation; output escaping remains the responsibility
of the renderer. Passwords intentionally do not use these fields.
"""

import unicodedata

from django.core.validators import RegexValidator
from rest_framework import serializers


# Usernames already use periods throughout the application, so the accepted
# character set retains them even though the initial draft omitted them.
USERNAME_PATTERN = r'^[A-Za-z0-9._-]+$'
USERNAME_ERROR = 'Use only letters, numbers, periods, dashes, or underscores.'
RESERVED_USERNAMES = frozenset({'admin', 'root', 'support', 'null', 'undefined'})
PASSWORD_SPECIAL_CHARACTERS = frozenset('!@#$%^&*()-_+.')

# Email format: local-part starts alphanumeric, domain supports multi-label and
# hyphenated subdomains, and the alphabetic TLD contains at least two letters.
EMAIL_PATTERN = r'^[A-Za-z0-9][A-Za-z0-9._%+-]*@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$'
EMAIL_ERROR = 'Enter a valid email address with a complete domain.'

# Names accept common Latin accented letters and single separators between
# name parts; digits and leading, trailing, or repeated punctuation are invalid.
NAME_PATTERN = r"^[A-Za-z\u00C0-\u017F]+(?:[ '.-][A-Za-z\u00C0-\u017F]+)*$"
NAME_ERROR = 'Use letters with single spaces, apostrophes, periods, or hyphens between name parts.'


def _normalize_unicode(value):
    normalized = unicodedata.normalize('NFKC', value)
    if any(
        unicodedata.category(character).startswith('C') and not character.isspace()
        for character in normalized
    ):
        raise serializers.ValidationError('Control characters are not allowed.')
    return normalized


def normalize_human_text(value):
    """Normalize Unicode and collapse leading, trailing, and repeated whitespace."""
    return ' '.join(_normalize_unicode(value).split())


def normalize_identifier(value):
    """Normalize Unicode and remove surrounding whitespace from identifiers."""
    return _normalize_unicode(value).strip()


def normalize_email(value):
    """Store email addresses in one comparison-safe canonical form."""
    return normalize_identifier(value).casefold()


def validate_password_policy(value, *, username='', email=''):
    """Apply the account password policy without returning the secret in errors."""
    # Keep the existing 12-character minimum while adding the acceptance-rule
    # counts. Regex alone would make field-specific error messages much less useful.
    checks = (
        (len(value) >= 12, 'Password must be at least 12 characters long.'),
        (sum(character.islower() for character in value) >= 3,
         'Password must contain at least three lowercase letters.'),
        (sum(character.isupper() for character in value) >= 2,
         'Password must contain at least two uppercase letters.'),
        (sum(character.isdigit() for character in value) >= 2,
         'Password must contain at least two numbers.'),
        (any(character in PASSWORD_SPECIAL_CHARACTERS for character in value),
         'Password must contain at least one approved symbol.'),
    )
    for accepted, message in checks:
        if not accepted:
            raise serializers.ValidationError(message)

    folded_password = value.casefold()
    for identity_value in (username, email):
        normalized_identity = identity_value.strip().casefold()
        if normalized_identity and normalized_identity in folded_password:
            raise serializers.ValidationError(
                'Password must not contain your username or email address.'
            )
    return value


class HumanTextField(serializers.CharField):
    def to_internal_value(self, data):
        return normalize_human_text(super().to_internal_value(data))


class NameField(HumanTextField):
    def __init__(self, **kwargs):
        error_messages = {'max_length': 'Name must be 50 characters or fewer.'}
        error_messages.update(kwargs.pop('error_messages', {}))
        validators = list(kwargs.pop('validators', []))
        validators.append(RegexValidator(NAME_PATTERN, NAME_ERROR))
        super().__init__(
            max_length=50,
            validators=validators,
            error_messages=error_messages,
            **kwargs,
        )


class UsernameField(serializers.RegexField):
    def __init__(self, **kwargs):
        error_messages = {'invalid': USERNAME_ERROR}
        error_messages.update(kwargs.pop('error_messages', {}))
        super().__init__(
            USERNAME_PATTERN,
            min_length=3,
            max_length=30,
            error_messages=error_messages,
            **kwargs,
        )

    def to_internal_value(self, data):
        return normalize_identifier(super().to_internal_value(data))

    def run_validators(self, value):
        super().run_validators(value)
        if value.casefold() in RESERVED_USERNAMES:
            raise serializers.ValidationError('Choose a different username.')


class NormalizedEmailField(serializers.EmailField):
    def __init__(self, **kwargs):
        validators = list(kwargs.pop('validators', []))
        validators.append(RegexValidator(EMAIL_PATTERN, EMAIL_ERROR))
        super().__init__(validators=validators, **kwargs)

    def to_internal_value(self, data):
        return normalize_email(super().to_internal_value(data))


class IdentifierField(serializers.CharField):
    """Identifier normalization without registration-format enforcement."""

    def to_internal_value(self, data):
        return normalize_identifier(super().to_internal_value(data))
