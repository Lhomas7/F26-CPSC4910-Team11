from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinValueValidator, URLValidator
from django.db import models


class CatalogProduct(models.Model):
    """A manually entered reward offered by one sponsor organization."""

    sponsor = models.ForeignKey(
        'accounts.SponsorCompany',
        on_delete=models.PROTECT,
        related_name='catalog_products',
    )
    name = models.CharField(max_length=200)
    description = models.TextField(
        blank=True, max_length=5000, validators=[MaxLengthValidator(5000)],
    )
    # Only store the URL: Django does not fetch or proxy external product images.
    # HTTPS avoids mixed-content images on the deployed HTTPS application.
    image_url = models.URLField(
        max_length=2048, blank=True,
        validators=[URLValidator(schemes=['https'])],
    )
    # Keep money exact. Point cost is intentionally absent until conversion
    # settings and the default rate are agreed; zero dollars remains valid.
    price_usd = models.DecimalField(
        max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    # Manual availability is not a claim about a future provider's live stock.
    is_available = models.BooleanField(default=True)
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
        ]
        indexes = [
            models.Index(
                fields=('sponsor', 'is_available'),
                name='catalog_sponsor_available_idx',
            ),
        ]

    def clean(self):
        super().clean()
        # The future creation serializer must also validate input. full_clean()
        # provides the same whitespace-only-name guard to non-API callers.
        if isinstance(self.name, str):
            self.name = self.name.strip()
        if not self.name:
            raise ValidationError({'name': 'Enter a product name.'})

    def __str__(self):
        return self.name
