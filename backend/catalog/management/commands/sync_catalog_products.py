"""Refresh imported demo catalog products; suitable for a scheduled job."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import models
from django.utils import timezone

from catalog.models import CatalogProduct
from catalog.providers import ProductProviderError
from catalog.services.provider_import import refresh_provider_product


class Command(BaseCommand):
    help = 'Refresh stale Fake Store product details and prices (not inventory).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=100)

    def handle(self, *args, **options):
        limit = options['limit']
        if limit < 1 or limit > 1000:
            raise ValueError('--limit must be between 1 and 1000.')
        cutoff = timezone.now() - timedelta(hours=24)
        products = CatalogProduct.objects.filter(provider='fake_store').filter(
            models.Q(last_synced_at__lt=cutoff) | models.Q(last_synced_at__isnull=True)
        ).order_by('last_synced_at', 'pk').values_list('pk', flat=True)[:limit]
        refreshed = failed = 0
        for product_id in products:
            try:
                refresh_provider_product(product_id=product_id)
            except (ProductProviderError, ValueError):
                failed += 1
            else:
                refreshed += 1
        self.stdout.write(f'Refreshed {refreshed} imported products; {failed} failed.')
