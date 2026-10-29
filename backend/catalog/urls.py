from django.urls import path

from .views import CatalogBrowseView, SponsorProductAvailabilityView, SponsorProductCreateView

app_name = 'catalog'

urlpatterns = [
    path('catalog/', CatalogBrowseView.as_view(), name='browse'),
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
