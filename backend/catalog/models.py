from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinValueValidator, URLValidator
from django.db import models


class CatalogProduct(models.Model):
    """A sponsor reward, entered manually or linked to an external provider."""

    sponsor = models.ForeignKey(
        'accounts.SponsorCompany',
        on_delete=models.PROTECT,
        related_name='catalog_products',
    )
    name = models.CharField(max_length=200)
    description = models.TextField(
        blank=True,
        max_length=5000,
        validators=[MaxLengthValidator(5000)],
    )
    # Only store the URL: Django does not fetch or proxy external product images.
    # HTTPS avoids mixed-content images on the deployed HTTPS application.
    image_url = models.URLField(
        max_length=2048,
        blank=True,
        validators=[URLValidator(schemes=['https'])],
    )
    # Keep money exact. Point cost is derived at read time from the sponsor's
    # current conversion rate rather than stored as a second, stale price.
    price_usd = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    # Manual availability is not a claim about a future provider's live stock.
    is_available = models.BooleanField(default=True)
    # Both identifiers are absent for manually entered products. Imported
    # products are unique within one sponsor's catalog, not across sponsors.
    provider = models.CharField(max_length=100, null=True, blank=True)
    external_product_id = models.CharField(max_length=255, null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('name', 'id')
        constraints = [
            models.CheckConstraint(
                condition=models.Q(price_usd__gte=0),
                name='catalog_product_price_nonnegative',
            ),
            models.CheckConstraint(
                condition=~models.Q(name=''),
                name='catalog_product_name_nonempty',
            ),
            models.CheckConstraint(
                condition=(models.Q(provider__isnull=True, external_product_id__isnull=True)
                           | (models.Q(provider__isnull=False, external_product_id__isnull=False)
                              & ~models.Q(provider='') & ~models.Q(external_product_id=''))),
                name='catalog_provider_identity_pair',
            ),
            models.UniqueConstraint(
                fields=('sponsor', 'provider', 'external_product_id'),
                name='catalog_sponsor_provider_product_unique',
            ),
        ]
        indexes = [
            models.Index(
                fields=('sponsor', 'is_available'),
                name='catalog_sponsor_available_idx',
            ),
        ]

    def clean(self):
        super().clean()
        # The creation serializer also validates input. full_clean()
        # provides the same whitespace-only-name guard to non-API callers.
        if isinstance(self.name, str):
            self.name = self.name.strip()
        if not self.name:
            raise ValidationError({'name': 'Enter a product name.'})
        if (self.provider is None) != (self.external_product_id is None):
            raise ValidationError('Provider and external product ID must be set together.')
        if self.provider is not None and (not self.provider.strip() or not self.external_product_id.strip()):
            raise ValidationError('Provider and external product ID cannot be blank.')

    def __str__(self):
        return self.name
