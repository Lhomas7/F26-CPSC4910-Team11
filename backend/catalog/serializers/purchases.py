from rest_framework import serializers

from catalog.models import Redemption, RedemptionItem


class PurchaseDateFilterSerializer(serializers.Serializer):
    completed_from = serializers.DateTimeField(required=False)
    completed_before = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        start = attrs.get('completed_from')
        end = attrs.get('completed_before')
        if start is not None and end is not None and start >= end:
            raise serializers.ValidationError({'completed_before': 'End must be after start.'})
        return attrs


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = RedemptionItem
        fields = ('id', 'product_name', 'quantity', 'unit_points')
        read_only_fields = fields


class PurchaseHistorySerializer(serializers.ModelSerializer):
    reference = serializers.CharField(source='sale.reference', read_only=True)
    status = serializers.SerializerMethodField()
    items = PurchaseItemSerializer(many=True, read_only=True)

    def get_status(self, _redemption):
        # Redemption rows are created only when an internal checkout completes.
        return 'completed'

    class Meta:
        model = Redemption
        fields = ('id', 'reference', 'status', 'completed_at', 'total_points', 'items')
        read_only_fields = fields
