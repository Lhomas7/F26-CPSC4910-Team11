from django.urls import path

from ..views.help import HelpContactsView

urlpatterns = [
    path('help/contacts/', HelpContactsView.as_view(), name='help-contacts'),
]
