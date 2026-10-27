from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError

from .input_cleaning import unmet_password_requirements


class AccountPasswordPolicyValidator:
    """Django password validator for the account password policy.

    Listed in AUTH_PASSWORD_VALIDATORS so every path that sets a password runs
    it: the API serializers (through input_cleaning.validate_new_password), the
    Django admin's password forms, and `manage.py createsuperuser` /
    `changepassword`. Reports every unmet rule at once.
    """

    def validate(self, password, user=None):
        problems = unmet_password_requirements(
            password,
            username=getattr(user, 'username', '') or '',
            email=getattr(user, 'email', '') or '',
        )
        if problems:
            raise ValidationError(
                [ValidationError(message, code='password_policy') for message in problems]
            )

    def get_help_text(self):
        # The individual requirements are published by GET /api/password-policy/.
        return 'Your password must meet the account password requirements.'


PASSWORD_HISTORY_DEPTH = 5


class PasswordHistoryValidator:
    """Refuse any of the account's last few passwords, the current one included.

    Listed in AUTH_PASSWORD_VALIDATORS, so it runs everywhere validate_password
    does. New hashes are remembered by accounts.signals.remember_password,
    whichever way the password was stored. Unsaved users have no history.
    """

    def __init__(self, depth=PASSWORD_HISTORY_DEPTH):
        self.depth = depth

    def validate(self, password, user=None):
        if user is None or user.pk is None:
            return
        # Imported here: validators are loaded from settings by dotted path.
        from django.contrib.auth import get_user_model

        from .models import PasswordHistory

        # The stored current hash counts even for accounts created before history.
        current = get_user_model().objects.filter(pk=user.pk).values_list('password', flat=True)
        recent = PasswordHistory.objects.filter(user=user).values_list('password_hash', flat=True)
        hashes = dict.fromkeys([*current, *recent[: self.depth]])
        if any(check_password(password, encoded) for encoded in hashes if encoded):
            raise ValidationError(
                f"You can't reuse any of your last {self.depth} passwords.",
                code='password_reused',
            )

    def get_help_text(self):
        return f'Must not match any of your last {self.depth} passwords.'
