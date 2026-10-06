from rest_framework import serializers

from .models import Driver, PointTransaction
from .services import MAX_POINT_REASON_LENGTH


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
