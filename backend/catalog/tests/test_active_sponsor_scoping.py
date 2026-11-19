"""Everything a driver browses, buys, or reads follows their active sponsor."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from reports.models import CompletedSale
from rest_framework.test import APITestCase

from accounts.models import SponsorAccount, SponsorCompany
from accounts.tests.common import enroll_totp
from catalog.models import CartItem, CatalogProduct, Redemption
from drivers.models import DriverSponsorMembership, PointTransaction, SponsorBehavior
from drivers.testing import add_membership, create_driver


class ActiveSponsorScopingTests(APITestCase):
    cart_url = reverse('catalog:cart')
    review_url = reverse('catalog:cart-review')
    checkout_url = reverse('catalog:cart-checkout')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.alpha = SponsorCompany.objects.create(name='Alpha Freight', points_per_dollar=100)
        cls.beta = SponsorCompany.objects.create(name='Beta Haulers', points_per_dollar=100)
        cls.alpha_user = User.objects.create_user(username='scope.alpha')
        cls.beta_user = User.objects.create_user(username='scope.beta')
        for company, user in ((cls.alpha, cls.alpha_user), (cls.beta, cls.beta_user)):
            SponsorAccount.objects.create(user=user, company=company)
            enroll_totp(user)
        cls.driver_user = User.objects.create_user(username='scope.driver')
        cls.driver = create_driver(
            user=cls.driver_user, name='Scope Driver', sponsor=cls.alpha,
            status=DriverSponsorMembership.APPROVED,
        )
        add_membership(cls.driver, cls.beta)
        # A costs 100 points; the driver has 50 with Alpha and 500 with Beta.
        cls.alpha_mug = CatalogProduct.objects.create(
            sponsor=cls.alpha, name='Alpha Mug', price_usd='1.00'
        )
        cls.beta_cap = CatalogProduct.objects.create(
            sponsor=cls.beta, name='Beta Cap', price_usd='2.00'
        )
        cls.give(cls.alpha, cls.alpha_user, 50)
        cls.give(cls.beta, cls.beta_user, 500)
        cls.alpha_behavior = SponsorBehavior.objects.create(
            sponsor=cls.alpha, kind='good', description='Alpha inspection', point_value=10
        )
        cls.beta_behavior = SponsorBehavior.objects.create(
            sponsor=cls.beta, kind='good', description='Beta delivery', point_value=10
        )
        cls.alpha_purchase = cls.purchase(cls.alpha, 'alpha-sale')
        cls.beta_purchase = cls.purchase(cls.beta, 'beta-sale')

    @classmethod
    def give(cls, sponsor, user, points):
        PointTransaction.objects.create(
            driver=cls.driver, sponsor=sponsor, changed_by_user=user,
            point_change=points, reason='Safe driving',
        )

    @classmethod
    def purchase(cls, sponsor, reference):
        now = timezone.now()
        sale = CompletedSale.objects.create(
            driver=cls.driver, sponsor=sponsor, reference=reference,
            gross_amount_usd=Decimal('1.00'), completed_at=now,
        )
        return Redemption.objects.create(
            driver=cls.driver, sponsor=sponsor, sale=sale, total_points=100, completed_at=now,
        )

    def setUp(self):
        self.client.force_authenticate(self.driver_user)

    def switch(self, sponsor):
        response = self.client.post(
            reverse('driver-sponsors-active'), {'sponsor_id': sponsor.pk}, format='json'
        )
        self.assertEqual(response.status_code, 200)

    def balances(self):
        return self.driver.point_balance_for(self.alpha.pk), self.driver.point_balance_for(self.beta.pk)

    def checkout(self):
        token = self.client.post(self.review_url, {}, format='json').data['review_token']
        return self.client.post(self.checkout_url, {'review_token': token}, format='json')

    def test_reads_follow_the_active_sponsor(self):
        for sponsor, product, balance, behavior, purchase in (
            (self.alpha, self.alpha_mug, 50, self.alpha_behavior, self.alpha_purchase),
            (self.beta, self.beta_cap, 500, self.beta_behavior, self.beta_purchase),
        ):
            with self.subTest(sponsor=sponsor.name):
                self.switch(sponsor)
                catalog = self.client.get(reverse('catalog:browse')).data
                self.assertEqual(catalog['sponsor']['id'], sponsor.pk)
                self.assertEqual(catalog['point_balance'], balance)
                self.assertEqual([row['id'] for row in catalog['results']], [product.pk])

                cart = self.client.get(self.cart_url).data
                self.assertEqual((cart['sponsor']['id'], cart['point_balance']), (sponsor.pk, balance))

                history = self.client.get(reverse('point-history')).data
                rows = history['results'] if isinstance(history, dict) else history
                self.assertEqual({row['sponsor_name'] for row in rows}, {sponsor.name})

                purchases = self.client.get(reverse('catalog:purchase-history')).data
                self.assertEqual([row['id'] for row in purchases['results']], [purchase.pk])

                behaviors = self.client.get(reverse('point-behaviors')).data
                rows = behaviors['results'] if isinstance(behaviors, dict) else behaviors
                self.assertEqual([row['id'] for row in rows], [behavior.pk])

                organization = self.client.get(reverse('accounts:sponsor-organization')).data
                self.assertEqual(organization['name'], sponsor.name)

    def test_purchase_detail_stays_reachable_after_switching(self):
        self.switch(self.beta)
        url = reverse('catalog:purchase-detail', kwargs={'pk': self.alpha_purchase.pk})

        self.assertEqual(self.client.get(url).status_code, 200)

    def test_another_sponsors_cart_items_wait_until_switching_back(self):
        CartItem.objects.create(driver=self.driver, product=self.beta_cap)
        self.client.post(reverse('catalog:cart-items'), {'product_id': self.alpha_mug.pk}, format='json')

        self.assertEqual(self.cart_product_ids(), [self.alpha_mug.pk])
        self.switch(self.beta)
        self.assertEqual(self.cart_product_ids(), [self.beta_cap.pk])
        self.switch(self.alpha)
        self.assertEqual(self.cart_product_ids(), [self.alpha_mug.pk])

    def test_emptying_the_cart_keeps_other_sponsors_items(self):
        CartItem.objects.create(driver=self.driver, product=self.alpha_mug)
        CartItem.objects.create(driver=self.driver, product=self.beta_cap)
        self.switch(self.beta)

        self.client.delete(self.cart_url)

        self.switch(self.alpha)
        self.assertEqual(self.cart_product_ids(), [self.alpha_mug.pk])

    def cart_product_ids(self):
        return [row['product']['id'] for row in self.client.get(self.cart_url).data['results']]

    def test_another_sponsors_catalog_products_cannot_be_added(self):
        response = self.client.post(
            reverse('catalog:cart-items'), {'product_id': self.beta_cap.pk}, format='json'
        )

        self.assertEqual(response.status_code, 404)

    def test_checkout_spends_only_the_active_sponsors_points(self):
        CartItem.objects.create(driver=self.driver, product=self.alpha_mug)

        response = self.checkout()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'insufficient_points')
        self.assertEqual(self.balances(), (50, 500))
        self.assertTrue(CartItem.objects.filter(driver=self.driver, product=self.alpha_mug).exists())

    def test_successful_checkout_deducts_only_from_the_active_sponsor(self):
        self.give(self.alpha, self.alpha_user, 100)
        CartItem.objects.create(driver=self.driver, product=self.alpha_mug)

        response = self.checkout()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['purchase']['point_balance'], 50)
        self.assertEqual(self.balances(), (50, 500))

    def test_switching_between_review_and_checkout_needs_a_new_review(self):
        CartItem.objects.create(driver=self.driver, product=self.alpha_mug)
        CartItem.objects.create(driver=self.driver, product=self.beta_cap)
        token = self.client.post(self.review_url, {}, format='json').data['review_token']
        self.switch(self.beta)

        response = self.client.post(self.checkout_url, {'review_token': token}, format='json')

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'review_changed')
        self.assertEqual(response.data['review']['sponsor']['id'], self.beta.pk)
        self.assertEqual(self.balances(), (50, 500))
