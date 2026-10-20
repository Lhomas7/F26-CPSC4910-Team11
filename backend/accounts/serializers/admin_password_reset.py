from rest_framework import serializers

from .profiles import ChangePasswordSerializer


class AdminPasswordResetRequestSerializer(serializers.Serializer):
    # The requesting administrator re-enters their own password: a hijacked,
    # already-signed-in session alone must not be able to start a reset.
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)


class AdminPasswordResetConfirmSerializer(ChangePasswordSerializer):
    """New password plus the second factor, checked for shape only.

    Deliberately run without the account in context: rules that compare against
    the account (same as the current password, similar to the username) are
    applied later, after the second factor, so someone holding only the link
    cannot use them to learn anything about the account.
    """

    method = serializers.ChoiceField(choices=['totp', 'backup'])
    code = serializers.CharField(write_only=True, max_length=64)
