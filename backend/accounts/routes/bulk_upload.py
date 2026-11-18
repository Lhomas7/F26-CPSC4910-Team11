from django.urls import path

from ..views.bulk_upload import BulkUploadView

urlpatterns = [
    path('bulk-upload/', BulkUploadView.as_view(), name='bulk-upload'),
]
