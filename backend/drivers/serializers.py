from rest_framework import serializers
from .models import AboutInformation, Driver

class DriverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = ['id', 'name', 'sponsor_id', 'status']


class AboutInformationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutInformation
        fields = [
            'team_number', 'version', 'release_date',
            'product_name', 'product_description',
        ]
