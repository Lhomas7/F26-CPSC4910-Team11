from rest_framework import serializers

from catalog.models import CartItem

from .products import CatalogBrowseProductSerializer, StrictInputSerializer


class CartItemSerializer(serializers.ModelSerializer):
    # Pricing context (points_per_dollar, point_balance) is passed through to
    # the nested product so cart rows price exactly like catalog cards.
    product = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ('id', 'product', 'added_at')
        read_only_fields = fields

    def get_product(self, obj):
        context = {**self.context, 'cart_product_ids': {obj.product_id}}
        return CatalogBrowseProductSerializer(obj.product, context=context).data


class CartAddSerializer(StrictInputSerializer):
    product_id = serializers.IntegerField(min_value=1)
