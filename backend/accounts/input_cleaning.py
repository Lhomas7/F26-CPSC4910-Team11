"""Canonical input fields shared by account serializers.

These helpers normalize representation; output escaping remains the responsibility
of the renderer. Passwords intentionally do not use these fields.
"""

import unicodedata

from rest_framework import serializers


USERNAME_PATTERN = r'^[A-Za-z0-9._-]+$'
USERNAME_ERROR = 'Use only letters, numbers, periods, dashes, or underscores.'


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


class HumanTextField(serializers.CharField):
    def to_internal_value(self, data):
        return normalize_human_text(super().to_internal_value(data))


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


class NormalizedEmailField(serializers.EmailField):
    def to_internal_value(self, data):
        return normalize_email(super().to_internal_value(data))


class IdentifierField(serializers.CharField):
    """Identifier normalization without registration-format enforcement."""

    def to_internal_value(self, data):
        return normalize_identifier(super().to_internal_value(data))
