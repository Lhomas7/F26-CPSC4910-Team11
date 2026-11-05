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
from .views.cart import CartReviewView, RedemptionLookupView

app_name = 'catalog'

urlpatterns = [
    path('catalog/', CatalogBrowseView.as_view(), name='browse'),
    path('cart/', CartView.as_view(), name='cart'),
    path('cart/items/', CartItemsView.as_view(), name='cart-items'),
    path('cart/items/<int:product_id>/', CartItemView.as_view(), name='cart-item'),
    path('cart/checkout/', CartCheckoutView.as_view(), name='cart-checkout'),
    path('cart/review/', CartReviewView.as_view(), name='cart-review'),
    path('cart/redemptions/by-key/<uuid:key>/', RedemptionLookupView.as_view(), name='redemption-lookup'),
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
