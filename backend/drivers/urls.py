from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DriverViewSet, PointHistoryView

router = DefaultRouter()
router.register('sponsor/drivers', DriverViewSet, basename='driver')

urlpatterns = [
    path('points/', PointHistoryView.as_view(), name='point-history'),
    *router.urls,
]
