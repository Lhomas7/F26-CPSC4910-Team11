from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ActiveSponsorView,
    DriverSponsorApplyView,
    DriverSponsorsView,
    DriverViewSet,
    PointHistoryView,
    SponsorBehaviorDetailView,
    SponsorBehaviorListView,
)

router = DefaultRouter()
router.register('sponsor/drivers', DriverViewSet, basename='driver')

urlpatterns = [
    path('driver/sponsors/', DriverSponsorsView.as_view(), name='driver-sponsors'),
    path('driver/sponsors/apply/', DriverSponsorApplyView.as_view(), name='driver-sponsors-apply'),
    path('driver/sponsors/active/', ActiveSponsorView.as_view(), name='driver-sponsors-active'),
    path('points/', PointHistoryView.as_view(), name='point-history'),
    path('points/behaviors/', SponsorBehaviorListView.as_view(), name='point-behaviors'),
    path(
        'points/behaviors/<int:pk>/',
        SponsorBehaviorDetailView.as_view(),
        name='point-behavior',
    ),
    *router.urls,
]
