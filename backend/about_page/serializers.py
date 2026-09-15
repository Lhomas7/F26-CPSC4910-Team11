from rest_framework import serializers

from .models import AboutPageRelease


class AboutPageReleaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutPageRelease
        fields = (
            'team_number',
            'version_number',
            'release_date',
            'product_name',
            'product_description',
        )
