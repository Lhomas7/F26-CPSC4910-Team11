from rest_framework import serializers

from .models import AboutPageRelease


class AboutPageReleaseSerializer(serializers.ModelSerializer):
    # Retain the current API key until the frontend contract changes in group 2.
    version = serializers.CharField(source='version_number', read_only=True)

    class Meta:
        model = AboutPageRelease
        fields = (
            'team_number',
            'version',
            'release_date',
            'product_name',
            'product_description',
        )
