from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DriverViewSet, PointHistoryView, SponsorBehaviorDetailView, SponsorBehaviorListView

router = DefaultRouter()
router.register('sponsor/drivers', DriverViewSet, basename='driver')

urlpatterns = [
    path('points/', PointHistoryView.as_view(), name='point-history'),
    path('points/behaviors/', SponsorBehaviorListView.as_view(), name='point-behaviors'),
    path(
        'points/behaviors/<int:pk>/',
        SponsorBehaviorDetailView.as_view(),
        name='point-behavior',
    ),
    *router.urls,
]
