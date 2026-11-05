from django.urls import path

from .views import CatalogBrowseView, SponsorProductAvailabilityView, SponsorProductCreateView
from .views.products import SponsorProviderImportView, SponsorProviderProductView, SponsorProviderSearchView

app_name = 'catalog'

urlpatterns = [
    path('catalog/', CatalogBrowseView.as_view(), name='browse'),
    path('sponsor/catalog/provider/products/', SponsorProviderSearchView.as_view(), name='sponsor-provider-search'),
    path('sponsor/catalog/provider/products/<int:product_id>/', SponsorProviderProductView.as_view(), name='sponsor-provider-product'),
    path('sponsor/catalog/provider/products/<int:product_id>/import/', SponsorProviderImportView.as_view(), name='sponsor-provider-import'),
    path(
        'sponsor/catalog/products/',
        SponsorProductCreateView.as_view(),
        name='sponsor-product-create',
    ),
    path(
        'sponsor/catalog/products/<int:product_id>/availability/',
        SponsorProductAvailabilityView.as_view(),
        name='sponsor-product-availability',
    ),
]
