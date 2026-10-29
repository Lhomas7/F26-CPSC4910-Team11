from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


PROJECT_SHARE_RATE = Decimal('0.01')


class CompletedSaleQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError('Completed sales are immutable audit records.')

    def delete(self):
        raise ValidationError('Completed sales are immutable audit records.')

    def bulk_update(self, objs, fields, batch_size=None):
        raise ValidationError('Completed sales are immutable audit records.')

    def bulk_create(self, objs, **kwargs):
        raise ValidationError('Record completed sales individually so validation and fee calculation run.')


class CompletedSale(models.Model):
    """Immutable reporting fact for one sale completed through the application.

    Sponsor, Driver, gross sales, and the project's one-percent share are
    snapshots. Reports must not rebuild historical money from catalog prices or
    a Driver's current organization relationship.
    """

    objects = CompletedSaleQuerySet.as_manager()

    sponsor = models.ForeignKey(
        'accounts.SponsorCompany',
        on_delete=models.PROTECT,
        related_name='completed_sales',
    )
    driver = models.ForeignKey(
        'drivers.Driver',
        on_delete=models.PROTECT,
        related_name='completed_sales',
    )
    reference = models.CharField(max_length=100, unique=True)
    gross_amount_usd = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    project_share_usd = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        editable=False,
        validators=[MinValueValidator(Decimal('0.0000'))],
    )
    completed_at = models.DateTimeField()
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-completed_at', '-id')
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gross_amount_usd__gte=0),
                name='completed_sale_gross_nonnegative',
            ),
            models.CheckConstraint(
                condition=models.Q(project_share_usd__gte=0),
                name='completed_sale_share_nonnegative',
            ),
        ]
        indexes = [
            models.Index(
                fields=('sponsor', '-completed_at'),
                name='sale_sponsor_time_idx',
            ),
            models.Index(
                fields=('driver', '-completed_at'),
                name='sale_driver_time_idx',
            ),
        ]

    def clean(self):
        super().clean()
        if isinstance(self.reference, str):
            self.reference = self.reference.strip()
        if not self.reference:
            raise ValidationError({'reference': 'Enter a sale reference.'})
        if self._state.adding and self.driver_id and self.sponsor_id and self.driver.sponsor_id != self.sponsor_id:
            raise ValidationError(
                {'driver': 'The Driver must belong to the sale sponsor when the sale is recorded.'}
            )

    def save(self, *args, **kwargs):
        # Enforce the cross-table ownership rule for every normal write, not
        # only ModelForms and callers that remember to invoke full_clean().
        self.clean()
        if self.pk:
            original = type(self).objects.filter(pk=self.pk).values(
                'sponsor_id',
                'driver_id',
                'reference',
                'gross_amount_usd',
                'project_share_usd',
                'completed_at',
            ).first()
            if original:
                current = {
                    'sponsor_id': self.sponsor_id,
                    'driver_id': self.driver_id,
                    'reference': self.reference,
                    'gross_amount_usd': self.gross_amount_usd,
                    'project_share_usd': self.project_share_usd,
                    'completed_at': self.completed_at,
                }
                if any(current[field] != original[field] for field in original):
                    raise ValidationError('Completed sales are immutable audit records.')
        else:
            self.project_share_usd = self.gross_amount_usd * PROJECT_SHARE_RATE
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Completed sales are immutable audit records.')

    def __str__(self):
        return self.reference

