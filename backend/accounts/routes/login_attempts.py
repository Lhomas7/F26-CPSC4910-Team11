from django.urls import path

from ..views.login_attempts import LoginAttemptsView

urlpatterns = [
    path('login-attempts/', LoginAttemptsView.as_view(), name='login-attempts'),
]
