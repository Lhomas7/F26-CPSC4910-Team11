from django.urls import path

from ..views import SelfProfileView

urlpatterns = [
    path('profile/', SelfProfileView.as_view(), name='self-profile'),
]
