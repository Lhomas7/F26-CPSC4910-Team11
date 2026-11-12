from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import MFASettings, SponsorAccount, SponsorCompany
from catalog.models import CatalogProduct, Redemption, RedemptionItem
from catalog.views.purchases import PurchaseHistoryPagination
from drivers.models import Driver
from reports.models import CompletedSale


class DriverPurchaseHistoryTests(APITestCase):
    list_url = reverse('catalog:purchase-history')

    @classmethod
    def setUpTestData(cls):
        users = get_user_model().objects
        cls.owner = users.create_user(username='buyer')
        cls.other = users.create_user(username='other-buyer')
        cls.admin = users.create_user(username='admin', is_staff=True)
        cls.sponsor = SponsorCompany.objects.create(name='Original Sponsor')
        cls.sponsor_user = users.create_user(username='original-sponsor')
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.sponsor)
        MFASettings.objects.create(user=cls.sponsor_user, totp_enabled=True)
        cls.driver = Driver.objects.create(user=cls.owner, name='Buyer', sponsor=cls.sponsor)
        cls.other_driver = Driver.objects.create(
            user=cls.other, name='Other Buyer', sponsor=cls.sponsor
        )
        now = timezone.now()
        cls.older = cls.create_purchase(cls.driver, 'older', now - timedelta(days=1))
        cls.latest = cls.create_purchase(cls.driver, 'latest', now)
        cls.foreign = cls.create_purchase(cls.other_driver, 'foreign', now)
        cls.product = CatalogProduct.objects.create(
            sponsor=cls.sponsor, name='Original Mug', price_usd='5.00'
        )
        RedemptionItem.objects.create(
            redemption=cls.latest,
            product=cls.product,
            product_name='Original Mug',
            unit_price_usd='5.00',
            unit_points=500,
            quantity=2,
        )

    @classmethod
    def create_purchase(cls, driver, reference, completed_at):
        sale = CompletedSale.objects.create(
            driver=driver,
            sponsor=cls.sponsor,
            reference=reference,
            gross_amount_usd=Decimal('10.00'),
            completed_at=completed_at,
        )
        return Redemption.objects.create(
            driver=driver,
            sponsor=cls.sponsor,
            sale=sale,
            total_points=1000,
            completed_at=completed_at,
        )

    def detail_url(self, purchase):
        return reverse('catalog:purchase-detail', kwargs={'pk': purchase.pk})

    def test_lists_only_own_purchases_in_newest_first_order_with_pagination(self):
        self.client.force_authenticate(self.owner)
        with patch.object(PurchaseHistoryPagination, 'page_size', 1):
            first = self.client.get(self.list_url)
            second = self.client.get(self.list_url, {'page': 2})

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['count'], 2)
        self.assertEqual([row['id'] for row in first.data['results']], [self.latest.pk])
        self.assertEqual([row['id'] for row in second.data['results']], [self.older.pk])
        self.assertIn('no-store', first['Cache-Control'])

    def test_detail_uses_checkout_snapshots_after_catalog_edit_and_sponsor_transfer(self):
        self.client.force_authenticate(self.owner)
        CatalogProduct.objects.filter(pk=self.product.pk).update(name='New Mug', price_usd='12.00')
        new_sponsor = SponsorCompany.objects.create(name='New Sponsor')
        Driver.objects.filter(pk=self.driver.pk).update(sponsor=new_sponsor, status='pending')

        response = self.client.get(self.detail_url(self.latest))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['reference'], 'latest')
        self.assertEqual(response.data['status'], 'completed')
        self.assertEqual(response.data['total_points'], 1000)
        self.assertIn('completed_at', response.data)
        item = response.data['items'][0]
        self.assertEqual(
            (item['product_name'], item['quantity'], item['unit_points']),
            ('Original Mug', 2, 500),
        )
        self.assertNotIn('unit_price_usd', item)
        self.assertIn('no-store', response['Cache-Control'])

    def test_cannot_read_another_drivers_purchase(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.detail_url(self.foreign)).status_code, 404)

    def test_requires_driver_authentication(self):
        for user in (None, self.admin):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.list_url).status_code, 403)
            self.assertEqual(self.client.get(self.detail_url(self.latest)).status_code, 403)

    def sponsor_history_url(self, driver):
        return reverse('catalog:sponsor-purchase-history', kwargs={'driver_id': driver.pk})

    def sponsor_detail_url(self, driver, purchase):
        return reverse(
            'catalog:sponsor-purchase-detail', kwargs={'driver_id': driver.pk, 'pk': purchase.pk}
        )

    def test_sponsor_history_filters_at_inclusive_start_and_exclusive_end(self):
        self.client.force_authenticate(self.sponsor_user)
        response = self.client.get(self.sponsor_history_url(self.driver), {
            'completed_from': self.older.completed_at.isoformat(),
            'completed_before': self.latest.completed_at.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data['results']], [self.older.pk])
        self.assertEqual(self.client.get(self.sponsor_detail_url(self.driver, self.latest)).status_code, 200)
        self.assertEqual(self.client.get(self.sponsor_detail_url(self.driver, self.foreign)).status_code, 404)

    def test_sponsor_cannot_read_another_organizations_driver_or_prior_sponsor_purchases(self):
        new_company = SponsorCompany.objects.create(name='New Sponsor')
        new_user = get_user_model().objects.create_user(username='new-sponsor')
        SponsorAccount.objects.create(user=new_user, company=new_company)
        MFASettings.objects.create(user=new_user, totp_enabled=True)
        self.client.force_authenticate(new_user)
        self.assertEqual(self.client.get(self.sponsor_history_url(self.driver)).status_code, 404)

        Driver.objects.filter(pk=self.driver.pk).update(sponsor=new_company)
        response = self.client.get(self.sponsor_history_url(self.driver))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(self.client.get(self.sponsor_detail_url(self.driver, self.latest)).status_code, 404)

        self.client.force_authenticate(self.sponsor_user)
        self.assertEqual(self.client.get(self.sponsor_history_url(self.driver)).status_code, 404)
        self.assertEqual(self.client.get(self.sponsor_detail_url(self.driver, self.latest)).status_code, 404)

    def test_sponsor_history_rejects_reversed_range_and_driver_access(self):
        self.client.force_authenticate(self.sponsor_user)
        response = self.client.get(self.sponsor_history_url(self.driver), {
            'completed_from': self.latest.completed_at.isoformat(),
            'completed_before': self.older.completed_at.isoformat(),
        })
        self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.sponsor_history_url(self.driver)).status_code, 403)
