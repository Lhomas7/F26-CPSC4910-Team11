from rest_framework import serializers

from .models import Driver, DriverStatusChange, PointTransaction
from .services import MAX_POINT_REASON_LENGTH
from .services.reasons import MAX_REASON_LENGTH


class DriverSerializer(serializers.ModelSerializer):
    point_balance = serializers.SerializerMethodField()
    sponsor_name = serializers.CharField(source='sponsor.name', read_only=True, default=None)

    class Meta:
        model = Driver
        fields = ['id', 'user', 'name', 'sponsor', 'sponsor_name', 'status', 'point_balance']

    def get_point_balance(self, driver):
        annotated = getattr(driver, 'calculated_point_balance', None)
        return annotated if annotated is not None else driver.point_balance


class PointAdjustmentRequestSerializer(serializers.Serializer):
    point_change = serializers.IntegerField()
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
        max_length=MAX_POINT_REASON_LENGTH + 1,
    )


class PointTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PointTransaction
        fields = (
            'id',
            'driver',
            'sponsor',
            'changed_by_user',
            'point_change',
            'reason',
            'changed_at',
        )
        read_only_fields = fields


def _display_name(user):
    if user is None:
        return None
    return user.get_full_name() or user.username


class PointHistorySerializer(serializers.ModelSerializer):
    """One point change as shown in point history, with readable names."""

    driver_name = serializers.CharField(source='driver.name', read_only=True)
    sponsor_name = serializers.CharField(source='sponsor.name', read_only=True)
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PointTransaction
        fields = (
            'id',
            'driver',
            'driver_name',
            'sponsor_name',
            'point_change',
            'reason',
            'changed_by_name',
            'changed_at',
        )
        read_only_fields = fields

    def get_changed_by_name(self, transaction):
        return _display_name(transaction.changed_by_user)


class DriverRemovalRequestSerializer(serializers.Serializer):
    # The service enforces the real rules; this only bounds the payload size.
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
        max_length=MAX_REASON_LENGTH + 1,
    )


class DriverStatusChangeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverStatusChange
        fields = ('id', 'driver', 'action', 'reason', 'changed_at')
        read_only_fields = fields
