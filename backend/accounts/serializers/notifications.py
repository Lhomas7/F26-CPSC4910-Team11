from rest_framework import serializers

from ..models import DriverNotificationPreferences


class NotificationPreferencesSerializer(serializers.ModelSerializer):
    # Texts go to the driver's contact number, so they need one on file.
    sms_available = serializers.SerializerMethodField()

    class Meta:
        model = DriverNotificationPreferences
        fields = (
            'points_added_enabled',
            'points_removed_enabled',
            'email_enabled',
            'sms_enabled',
            'sms_available',
        )

    def get_sms_available(self, preferences):
        return bool(preferences.driver.phone_number)

    def validate_sms_enabled(self, value):
        if value and not self.instance.driver.phone_number:
            raise serializers.ValidationError(
                'Add a phone number to your profile before turning on text alerts.'
            )
        return value
