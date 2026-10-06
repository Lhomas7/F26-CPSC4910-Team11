from rest_framework import serializers

from ..models import LoginAttempt


class LoginAttemptSerializer(serializers.ModelSerializer):
    """A user's own sign-in attempt: outcome and time only."""

    class Meta:
        model = LoginAttempt
        fields = ('id', 'timestamp', 'successful')
        read_only_fields = fields
