from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import AboutInformationView, DriverViewSet

router = DefaultRouter()
router.register('sponsor/drivers', DriverViewSet, basename='driver')

urlpatterns = [
    path('about/', AboutInformationView.as_view(), name='about-information'),
] + router.urls
