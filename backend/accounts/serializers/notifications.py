from rest_framework import serializers

from ..models import DriverNotificationPreferences, Notification, SponsorNotificationPreferences

# Alerts a driver cannot turn off: they are always recorded and emailed.
ALWAYS_ON_ALERTS = (Notification.SPONSOR_DROPPED, Notification.SECURITY)


class NotificationPreferencesSerializer(serializers.ModelSerializer):
    # Texts go to the driver's contact number, so they need one on file.
    sms_available = serializers.SerializerMethodField()
    always_on = serializers.SerializerMethodField()

    class Meta:
        model = DriverNotificationPreferences
        fields = (
            'points_added_enabled',
            'points_removed_enabled',
            'email_enabled',
            'sms_enabled',
            'sms_available',
            'always_on',
        )

    def get_always_on(self, preferences):
        return list(ALWAYS_ON_ALERTS)

    def get_sms_available(self, preferences):
        return bool(preferences.driver.phone_number)

    def validate_sms_enabled(self, value):
        if value and not self.instance.driver.phone_number:
            raise serializers.ValidationError(
                'Add a phone number to your profile before turning on text alerts.'
            )
        return value


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ('id', 'category', 'message', 'read', 'created_at')
        read_only_fields = fields


class MarkNotificationsReadSerializer(serializers.Serializer):
    # Omitted means "mark everything read", which is what opening the bell does.
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=200
    )


class DriverAlertSettingsSerializer(NotificationPreferencesSerializer):
    """A read-only copy of a driver's alert settings, as their sponsor sees it."""

    class Meta(NotificationPreferencesSerializer.Meta):
        fields = (
            'points_added_enabled',
            'points_removed_enabled',
            'email_enabled',
            'sms_enabled',
            'always_on',
        )
        read_only_fields = fields


class SponsorNotificationPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = SponsorNotificationPreferences
        fields = ('email_enabled',)
