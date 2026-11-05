from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import MFASettings, SponsorAccount, SponsorCompany
from catalog.models import CartItem, CatalogProduct, Redemption
from drivers.models import Driver, PointTransaction
from reports.models import CompletedSale


class CommerceIntegrationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Commerce Sponsor', points_per_dollar=100)
        cls.sponsor = User.objects.create_user(username='commerce.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        MFASettings.objects.create(user=cls.sponsor, totp_enabled=True)
        cls.user = User.objects.create_user(username='commerce.driver')
        cls.driver = Driver.objects.create(user=cls.user, name='Commerce Driver', sponsor=cls.company, status='approved')
        cls.admin = User.objects.create_user(username='commerce.admin', is_staff=True)
        MFASettings.objects.create(user=cls.admin, totp_enabled=True)
        PointTransaction.objects.create(driver=cls.driver, sponsor=cls.company,
                                        changed_by_user=cls.sponsor, point_change=10000, reason='Safe driving')

    @patch('catalog.fake_store.ProductProviderClient')
    def test_provider_import_refresh_review_checkout_recovery_and_report(self, provider):
        sample = {'id': 7, 'title': 'Travel Bag', 'description': 'Travel essentials',
                  'price': 24.95, 'image': 'https://fakestoreapi.com/img/bag.jpg'}
        provider.return_value.get_json.return_value = sample
        self.client.force_authenticate(self.sponsor)
        imported = self.client.post(reverse('catalog:sponsor-provider-import', args=[7]), {}, format='json')
        self.assertEqual(imported.status_code, 201)
        product_id = imported.data['id']
        self.client.force_authenticate(self.user)
        listing = self.client.get(reverse('catalog:browse'))
        self.assertEqual(listing.data['results'][0]['point_cost'], 2495)
        self.assertEqual(self.client.post(reverse('catalog:cart-items'), {'product_id': product_id}, format='json').status_code, 201)
        review = self.client.post(reverse('catalog:cart-review'), {}, format='json')
        self.assertEqual(review.status_code, 200)

        # A provider refresh after review must require explicit reconfirmation.
        self.client.force_authenticate(self.sponsor)
        provider.return_value.get_json.return_value = {**sample, 'price': 25.99}
        self.assertEqual(self.client.post(reverse('catalog:sponsor-provider-refresh', args=[product_id]), {}, format='json').status_code, 200)
        self.client.force_authenticate(self.user)
        key = str(uuid4())
        changed = self.client.post(reverse('catalog:cart-checkout'), {
            'idempotency_key': key, 'review_token': review.data['review_token'],
        }, format='json')
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(changed.data['review']['total_points'], 2599)
        self.assertFalse(CompletedSale.objects.exists())
        completed = self.client.post(reverse('catalog:cart-checkout'), {
            'idempotency_key': key, 'review_token': changed.data['review']['review_token'],
        }, format='json')
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.data['purchase']['point_balance'], 7401)
        self.assertFalse(CartItem.objects.exists())
        self.assertEqual(Redemption.objects.count(), 1)

        # Later product edits do not rewrite receipts or historical report money.
        CatalogProduct.objects.filter(pk=product_id).update(name='New Bag', price_usd=Decimal('99.00'))
        replay = self.client.post(reverse('catalog:cart-checkout'), {'idempotency_key': key}, format='json')
        self.assertTrue(replay.data['purchase']['replayed'])
        self.assertEqual(replay.data['purchase']['line_items'], [{'name': 'Travel Bag', 'unit_points': 2599, 'quantity': 1}])
        self.assertEqual(PointTransaction.objects.filter(point_change__lt=0).count(), 1)
        lookup = self.client.get(reverse('catalog:redemption-lookup', args=[key]))
        self.assertEqual(lookup.data['purchase']['reference'], completed.data['purchase']['reference'])
        self.client.force_authenticate(self.admin)
        report = self.client.get(reverse('reports:sales'), {'group_by': 'sponsor'})
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.data['summary']['sale_count'], 1)
        self.assertEqual(report.data['summary']['gross_sales_usd'], '25.99')
        self.assertEqual(report.data['summary']['project_share_usd'], '0.2599')

    def test_late_reporting_failure_rolls_back_points_cart_and_redemption(self):
        product = CatalogProduct.objects.create(sponsor=self.company, name='Mug', price_usd=Decimal('10.00'))
        CartItem.objects.create(driver=self.driver, product=product)
        self.client.force_authenticate(self.user)
        token = self.client.post(reverse('catalog:cart-review'), {}, format='json').data['review_token']
        with patch('catalog.services.cart.CompletedSale.objects.create', side_effect=RuntimeError('Report write failed')):
            with self.assertRaises(RuntimeError):
                self.client.post(reverse('catalog:cart-checkout'), {
                    'review_token': token, 'idempotency_key': str(uuid4()),
                }, format='json')
        self.assertEqual(Driver.objects.get(pk=self.driver.pk).point_balance, 10000)
        self.assertTrue(CartItem.objects.filter(driver=self.driver).exists())
        self.assertFalse(Redemption.objects.exists())
        self.assertFalse(CompletedSale.objects.exists())
