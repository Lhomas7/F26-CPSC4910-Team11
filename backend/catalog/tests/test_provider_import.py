from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import MFASettings, SponsorAccount, SponsorCompany
from catalog.models import CatalogProduct
from catalog.providers import ProductProviderError


SAMPLE = {
    'id': 7,
    'title': 'Travel Bag',
    'description': 'Carry essentials',
    'image': 'https://fakestoreapi.com/img/bag.jpg',
    'price': 29.95,
}


class ProviderImportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Import Sponsor')
        cls.other_company = SponsorCompany.objects.create(name='Other Import Sponsor')
        cls.sponsor = get_user_model().objects.create_user(username='import.sponsor')
        cls.other_sponsor = get_user_model().objects.create_user(username='import.other')
        for user, company in ((cls.sponsor, cls.company), (cls.other_sponsor, cls.other_company)):
            SponsorAccount.objects.create(user=user, company=company)
            MFASettings.objects.create(user=user, totp_enabled=True)

    def setUp(self):
        self.client.force_authenticate(self.sponsor)

    @patch('catalog.fake_store.ProductProviderClient')
    def test_search_preview_and_import_fresh_provider_details(self, client_class):
        client_class.return_value.get_json.side_effect = [[SAMPLE], SAMPLE, SAMPLE]
        search = self.client.get(reverse('catalog:sponsor-provider-search'), {'q': 'travel'})
        self.assertEqual(search.status_code, 200)
        self.assertEqual(search.data[0]['external_product_id'], '7')
        self.assertFalse(search.data[0]['inventory_verified'])
        preview = self.client.get(reverse('catalog:sponsor-provider-product', args=[7]))
        self.assertEqual(preview.status_code, 200)
        imported = self.client.post(reverse('catalog:sponsor-provider-import', args=[7]), {}, format='json')
        self.assertEqual(imported.status_code, 201)
        product = CatalogProduct.objects.get(pk=imported.data['id'])
        self.assertEqual(product.sponsor_id, self.company.pk)
        self.assertEqual(product.provider, 'fake_store')
        self.assertEqual(product.external_product_id, '7')
        self.assertIsNotNone(product.last_synced_at)
        self.assertEqual(client_class.return_value.get_json.call_count, 3)

    @patch('catalog.fake_store.ProductProviderClient')
    def test_duplicate_import_is_conflict_but_other_sponsor_can_import(self, client_class):
        client_class.return_value.get_json.return_value = SAMPLE
        url = reverse('catalog:sponsor-provider-import', args=[7])
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 201)
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 409)
        self.client.force_authenticate(self.other_sponsor)
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 201)
        self.assertEqual(CatalogProduct.objects.filter(provider='fake_store').count(), 2)

    @patch('catalog.fake_store.ProductProviderClient')
    def test_provider_failure_and_invalid_data_do_not_create_products(self, client_class):
        url = reverse('catalog:sponsor-provider-import', args=[7])
        client_class.return_value.get_json.side_effect = ProductProviderError('secret upstream detail')
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('secret', str(response.data))
        client_class.return_value.get_json.side_effect = None
        client_class.return_value.get_json.return_value = {**SAMPLE, 'price': -1}
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 502)
        self.assertEqual(CatalogProduct.objects.count(), 0)

    @patch('catalog.fake_store.ProductProviderClient')
    def test_import_refuses_browser_supplied_price_and_unauthorized_account(self, client_class):
        url = reverse('catalog:sponsor-provider-import', args=[7])
        response = self.client.post(url, {'price_usd': '0.00'}, format='json')
        self.assertEqual(response.status_code, 400)
        client_class.assert_not_called()
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(url, {}, format='json').status_code, (401, 403))
        client_class.assert_not_called()

    @patch('catalog.fake_store.ProductProviderClient')
    def test_refresh_updates_price_and_details_but_preserves_availability(self, client_class):
        client_class.return_value.get_json.return_value = SAMPLE
        imported = self.client.post(reverse('catalog:sponsor-provider-import', args=[7]), {}, format='json')
        product = CatalogProduct.objects.get(pk=imported.data['id'])
        product.is_available = False
        product.save(update_fields=['is_available'])
        previous_sync = product.last_synced_at
        client_class.return_value.get_json.return_value = {
            **SAMPLE, 'title': 'Updated Bag', 'price': 34.50,
        }
        url = reverse('catalog:sponsor-provider-refresh', args=[product.pk])
        self.client.force_authenticate(self.other_sponsor)
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 404)
        self.client.force_authenticate(self.sponsor)
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.name, 'Updated Bag')
        self.assertEqual(str(product.price_usd), '34.50')
        self.assertFalse(product.is_available)
        self.assertGreaterEqual(product.last_synced_at, previous_sync)
        self.assertFalse(response.data['provider_data_stale'])

    @patch('catalog.fake_store.ProductProviderClient')
    def test_refresh_failure_preserves_last_known_product_data(self, client_class):
        client_class.return_value.get_json.return_value = SAMPLE
        imported = self.client.post(reverse('catalog:sponsor-provider-import', args=[7]), {}, format='json')
        product = CatalogProduct.objects.get(pk=imported.data['id'])
        old_time = timezone.now() - timedelta(days=2)
        CatalogProduct.objects.filter(pk=product.pk).update(last_synced_at=old_time)
        client_class.return_value.get_json.side_effect = ProductProviderError('upstream failed')
        response = self.client.post(reverse('catalog:sponsor-provider-refresh', args=[product.pk]), {}, format='json')
        self.assertEqual(response.status_code, 502)
        product.refresh_from_db()
        self.assertEqual(product.price_usd, Decimal('29.95'))
        self.assertEqual(product.last_synced_at, old_time)

    @patch('catalog.fake_store.ProductProviderClient')
    def test_sync_command_refreshes_only_stale_imports(self, client_class):
        client_class.return_value.get_json.return_value = SAMPLE
        imported = self.client.post(reverse('catalog:sponsor-provider-import', args=[7]), {}, format='json')
        product = CatalogProduct.objects.get(pk=imported.data['id'])
        CatalogProduct.objects.filter(pk=product.pk).update(
            last_synced_at=timezone.now() - timedelta(days=2)
        )
        manual = CatalogProduct.objects.create(
            sponsor=self.company, name='Manual Mug', price_usd=Decimal('5.00')
        )
        client_class.return_value.get_json.return_value = {**SAMPLE, 'price': 39.95}
        output = StringIO()
        call_command('sync_catalog_products', stdout=output)
        product.refresh_from_db()
        manual.refresh_from_db()
        self.assertEqual(product.price_usd, Decimal('39.95'))
        self.assertEqual(manual.price_usd, Decimal('5.00'))
        self.assertIn('Refreshed 1 imported products; 0 failed.', output.getvalue())
