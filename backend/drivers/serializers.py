from rest_framework import serializers

from accounts.models import SponsorDriverAlert

from .models import Driver, DriverStatusChange, PointTransaction, SponsorBehavior
from .services import MAX_POINT_ADJUSTMENT, MAX_POINT_REASON_LENGTH
from .services.reasons import MAX_REASON_LENGTH, normalize_reason


class DriverSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    point_balance = serializers.SerializerMethodField()
    sponsor_name = serializers.CharField(source='sponsor.name', read_only=True, default=None)

    class Meta:
        model = Driver
        fields = [
            'id',
            'user',
            'username',
            'name',
            'sponsor',
            'sponsor_name',
            'status',
            'point_balance',
        ]
        read_only_fields = fields

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


class SponsorDriverAlertSerializer(serializers.ModelSerializer):
    """The signed-in sponsor's point alert choices for one driver."""

    class Meta:
        model = SponsorDriverAlert
        fields = ('on_points_added', 'on_points_removed')


class SponsorBehaviorSerializer(serializers.ModelSerializer):
    """A sponsor's example behavior; the sponsor comes from the request."""

    point_value = serializers.IntegerField(min_value=1, max_value=MAX_POINT_ADJUSTMENT)
    signed_points = serializers.IntegerField(read_only=True)
    # Bounds the payload only; validate_description applies the real limit.
    description = serializers.CharField(trim_whitespace=False, max_length=MAX_REASON_LENGTH + 1)

    class Meta:
        model = SponsorBehavior
        fields = ('id', 'kind', 'description', 'point_value', 'signed_points')
        read_only_fields = ('id', 'signed_points')
        # Uniqueness is checked in validate() with a friendlier message.
        validators = []

    def validate_description(self, value):
        def error(code, message):
            if code == 'missing_reason':
                message = 'Describe this behavior.'
            return serializers.ValidationError(message, code=code)

        description = normalize_reason(value, subject='this behavior', error=error)
        limit = SponsorBehavior.MAX_DESCRIPTION_LENGTH
        if len(description) > limit:
            raise serializers.ValidationError(
                f'Behaviors must be {limit} characters or fewer.', code='description_too_long'
            )
        return description

    def validate(self, attrs):
        sponsor = self.context['sponsor']
        kind = attrs.get('kind', getattr(self.instance, 'kind', None))
        description = attrs.get('description', getattr(self.instance, 'description', None))
        siblings = SponsorBehavior.objects.filter(sponsor=sponsor, kind=kind)
        if self.instance is not None:
            siblings = siblings.exclude(pk=self.instance.pk)
        if siblings.filter(description__iexact=description).exists():
            raise serializers.ValidationError(
                {'description': 'This behavior is already listed.'}, code='duplicate_behavior'
            )
        if siblings.count() >= SponsorBehavior.MAX_PER_KIND:
            raise serializers.ValidationError(
                {'kind': f'You can list up to {SponsorBehavior.MAX_PER_KIND} behaviors of each kind.'},
                code='too_many_behaviors',
            )
        return attrs
