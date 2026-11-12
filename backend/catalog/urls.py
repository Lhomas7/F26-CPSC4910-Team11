from django.urls import path

from .views import (
    CartCheckoutView,
    CartItemsView,
    CartItemView,
    CartView,
    CatalogBrowseView,
    SponsorProductAvailabilityView,
    SponsorProductCreateView,
)
from .views.cart import CartReviewView, CheckoutCancellationView, RedemptionLookupView
from .views.products import (
    SponsorProviderImportView,
    SponsorProviderProductView,
    SponsorProviderRefreshView,
    SponsorProviderSearchView,
)

app_name = 'catalog'

urlpatterns = [
    path('catalog/', CatalogBrowseView.as_view(), name='browse'),
    path('sponsor/catalog/provider/products/', SponsorProviderSearchView.as_view(), name='sponsor-provider-search'),
    path('sponsor/catalog/provider/products/<int:product_id>/', SponsorProviderProductView.as_view(), name='sponsor-provider-product'),
    path('sponsor/catalog/provider/products/<int:product_id>/import/', SponsorProviderImportView.as_view(), name='sponsor-provider-import'),
    path('sponsor/catalog/products/<int:product_id>/refresh/', SponsorProviderRefreshView.as_view(), name='sponsor-provider-refresh'),
    path('cart/', CartView.as_view(), name='cart'),
    path('cart/items/', CartItemsView.as_view(), name='cart-items'),
    path('cart/items/<int:product_id>/', CartItemView.as_view(), name='cart-item'),
    path('cart/checkout/', CartCheckoutView.as_view(), name='cart-checkout'),
    path('cart/review/', CartReviewView.as_view(), name='cart-review'),
    path('cart/redemptions/by-key/<uuid:key>/', RedemptionLookupView.as_view(), name='redemption-lookup'),
    path('cart/checkout/<uuid:key>/cancel/', CheckoutCancellationView.as_view(), name='checkout-cancel'),
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
