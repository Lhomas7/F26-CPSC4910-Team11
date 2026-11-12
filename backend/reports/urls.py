from django.urls import path

from .views import SalesReportExportView, SalesReportOptionsView, SalesReportView

app_name = 'reports'

urlpatterns = [
    path('reports/sales/options/', SalesReportOptionsView.as_view(), name='sales-options'),
    path('reports/sales/export/', SalesReportExportView.as_view(), name='sales-export'),
    path('reports/sales/', SalesReportView.as_view(), name='sales'),
]
