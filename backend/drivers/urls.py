from django.urls import path
from rest_framework.routers import DefaultRouter

from .auth_views import LoginView
from .views import DriverViewSet


router = DefaultRouter()
router.register("sponsor/drivers", DriverViewSet, basename="driver")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
]

urlpatterns += router.urls
