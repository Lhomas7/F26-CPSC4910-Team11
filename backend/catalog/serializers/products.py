from collections.abc import Mapping

from django.core.validators import URLValidator
from rest_framework import serializers

from accounts.input_cleaning import normalize_human_text, normalize_identifier
from catalog.models import CatalogProduct


class StrictInputSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        # Do not silently ignore ownership, prices on an availability action,
        # or future provider/point-cost fields that this API cannot honor.
        if isinstance(data, Mapping):
            unknown = data.keys() - self.fields.keys()
            if unknown:
                raise serializers.ValidationError({
                    field: 'This field is not accepted.' for field in sorted(unknown)
                })
        return super().to_internal_value(data)


class ProductTextField(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail('invalid')
        return super().to_internal_value(data)


class AvailabilityField(serializers.BooleanField):
    def to_internal_value(self, data):
        # Require explicit JSON booleans; strings such as "false" and numeric
        # values should not accidentally change a product's availability.
        if not isinstance(data, bool):
            self.fail('invalid', input=data)
        return data


class ProductCreateSerializer(StrictInputSerializer):
    name = ProductTextField(max_length=200)
    description = ProductTextField(max_length=5000, required=False, allow_blank=True, default='')
    image_url = serializers.URLField(
        max_length=2048, required=False, allow_blank=True, default='',
        validators=[URLValidator(schemes=['https'])],
    )
    price_usd = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    is_available = AvailabilityField(required=False, default=True)

    def validate_name(self, value):
        value = normalize_human_text(value)
        if not value:
            raise serializers.ValidationError('Enter a product name.')
        if len(value) > 200:
            raise serializers.ValidationError('Ensure this field has no more than 200 characters.')
        return value

    def validate_description(self, value):
        # Preserve paragraphs while normalizing Unicode and line endings.
        value = normalize_identifier(value.replace('\r\n', '\n').replace('\r', '\n'))
        if len(value) > 5000:
            raise serializers.ValidationError('Ensure this field has no more than 5000 characters.')
        return value


class ProductAvailabilitySerializer(StrictInputSerializer):
    is_available = AvailabilityField()


class CatalogProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogProduct
        fields = (
            'id', 'name', 'description', 'image_url', 'price_usd',
            'is_available', 'created_at', 'updated_at',
        )
        read_only_fields = fields
