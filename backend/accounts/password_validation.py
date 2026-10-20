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
