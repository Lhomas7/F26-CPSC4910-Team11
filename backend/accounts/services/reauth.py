"""Ask a signed-in user to re-enter their password before a consequential action."""

from rest_framework import status
from rest_framework.response import Response

from .login_audit import record_login_attempt
from .login_throttle import locked_out_response, lockout_seconds_remaining

CURRENT_PASSWORD_REQUIRED = 'Enter your current password to continue.'


def current_password_error(user, password):
    """An error response unless `password` is the user's current password, else None.

    Wrong answers count toward the same lockout as sign-in, so a hijacked
    session cannot use this prompt to guess the password.
    """
    locked_for = lockout_seconds_remaining(user.get_username())
    if locked_for:
        return locked_out_response(locked_for)
    if not isinstance(password, str) or not password:
        return Response(
            {'current_password': [CURRENT_PASSWORD_REQUIRED]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not user.check_password(password):
        record_login_attempt(user.get_username(), successful=False, user=user)
        return Response(
            {'current_password': ['Incorrect password.']},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None
