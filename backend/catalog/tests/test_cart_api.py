from django.contrib.auth import get_user_model
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import patch
from django.core import mail, signing
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from accounts.middleware import (
    IMPERSONATION_ROLE_KEY,
    IMPERSONATION_STARTED_KEY,
    IMPERSONATION_TARGET_KEY,
)
from accounts.models import (
    DriverNotificationPreferences,
    MFASettings,
    Notification,
    SponsorAccount,
    SponsorCompany,
)
from accounts.services.notify import notify_reward_purchase
from catalog.models import CartItem, CatalogProduct, Redemption, RedemptionItem
from drivers.models import Driver, PointTransaction
from drivers.services.membership import reassign_driver_sponsor, remove_driver_from_sponsor
from reports.models import CompletedSale


class DriverCartApiTests(APITestCase):
    cart_url = reverse('catalog:cart')
    items_url = reverse('catalog:cart-items')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Cart Sponsor', points_per_dollar=100)
        cls.other_company = SponsorCompany.objects.create(name='Other Cart Sponsor')
        cls.sponsor = User.objects.create_user(username='cart.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        MFASettings.objects.create(user=cls.sponsor, totp_enabled=True)
        cls.admin = User.objects.create_user(username='cart.admin', is_staff=True)
        MFASettings.objects.create(user=cls.admin, totp_enabled=True)
        cls.driver_user = User.objects.create_user(username='cart.driver')
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Cart Driver', sponsor=cls.company, status='approved'
        )
        cls.mug = CatalogProduct.objects.create(sponsor=cls.company, name='Mug', price_usd='12.50')
        cls.jacket = CatalogProduct.objects.create(
            sponsor=cls.company, name='Jacket', price_usd='40.00'
        )
        cls.unavailable = CatalogProduct.objects.create(
            sponsor=cls.company, name='Hat', price_usd='5.00', is_available=False
        )
        cls.foreign = CatalogProduct.objects.create(
            sponsor=cls.other_company, name='Foreign Reward', price_usd='1.00'
        )
        PointTransaction.objects.create(
            driver=cls.driver,
            sponsor=cls.company,
            changed_by_user=cls.sponsor,
            point_change=3000,
            reason='Safe driving',
        )

    def setUp(self):
        self.client.force_authenticate(self.driver_user)

    def item_url(self, product_id):
        return reverse('catalog:cart-item', kwargs={'product_id': product_id})

    def add(self, product):
        return self.client.post(self.items_url, {'product_id': product.pk}, format='json')

    def test_empty_cart(self):
        response = self.client.get(self.cart_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['item_count'], 0)
        self.assertEqual(response.data['total_points'], 0)
        self.assertEqual(response.data['point_balance'], 3000)
        self.assertIn('no-store', response['Cache-Control'])

    def test_add_list_and_remove(self):
        response = self.add(self.mug)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['item_count'], 1)
        self.add(self.jacket)

        response = self.client.get(self.cart_url)
        self.assertEqual(response.data['item_count'], 2)
        # 12.50 * 100 + 40.00 * 100
        self.assertEqual(response.data['total_points'], 5250)
        product = response.data['results'][0]['product']
        self.assertEqual(product['name'], 'Jacket')  # Newest first.
        self.assertEqual(product['point_cost'], 4000)
        self.assertFalse(product['can_afford'])
        self.assertTrue(product['in_cart'])

        response = self.client.delete(self.item_url(self.jacket.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['item_count'], 1)
        self.assertFalse(CartItem.objects.filter(product=self.jacket).exists())

    def test_adding_twice_keeps_one_item(self):
        self.assertEqual(self.add(self.mug).status_code, 201)
        response = self.add(self.mug)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['item_count'], 1)
        self.assertEqual(CartItem.objects.filter(driver=self.driver).count(), 1)

    def test_unavailable_product_cannot_be_added(self):
        response = self.add(self.unavailable)
        self.assertEqual(response.status_code, 400)
        self.assertIn('product_id', response.data)
        self.assertFalse(CartItem.objects.exists())

    def test_item_that_becomes_unavailable_stays_flagged(self):
        self.add(self.mug)
        CatalogProduct.objects.filter(pk=self.mug.pk).update(is_available=False)
        response = self.client.get(self.cart_url)
        self.assertEqual(response.data['item_count'], 1)
        self.assertFalse(response.data['results'][0]['product']['is_available'])
        self.assertEqual(self.client.delete(self.item_url(self.mug.pk)).status_code, 200)

    def test_other_sponsor_and_missing_products_look_the_same(self):
        self.assertEqual(self.add(self.foreign).status_code, 404)
        response = self.client.post(self.items_url, {'product_id': 999999}, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.delete(self.item_url(self.mug.pk)).status_code, 404)

    def test_input_is_strict(self):
        for payload in ({}, {'product_id': 'x'}, {'product_id': self.mug.pk, 'driver': 1}):
            with self.subTest(payload=payload):
                response = self.client.post(self.items_url, payload, format='json')
                self.assertEqual(response.status_code, 400)

    def refresh_login(self):
        # Reload so the cached driver profile reflects the updated row.
        self.client.force_authenticate(get_user_model().objects.get(pk=self.driver_user.pk))

    def test_pending_and_unassigned_drivers_are_refused_with_codes(self):
        Driver.objects.filter(pk=self.driver.pk).update(status='pending')
        self.refresh_login()
        response = self.client.get(self.cart_url)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'driver_not_approved')
        Driver.objects.filter(pk=self.driver.pk).update(sponsor=None)
        self.refresh_login()
        response = self.client.get(self.cart_url)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'sponsor_required')

    def test_sponsors_admins_and_anonymous_users_are_refused(self):
        for user in (self.sponsor, self.admin):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(self.cart_url).status_code, 403)
                self.assertEqual(self.add(self.mug).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.cart_url).status_code, (401, 403))

    def test_view_as_can_read_but_not_change_the_cart(self):
        CartItem.objects.create(driver=self.driver, product=self.mug)
        client = APIClient()
        client.force_login(self.admin)
        session = client.session
        session[IMPERSONATION_TARGET_KEY] = self.driver_user.pk
        session[IMPERSONATION_STARTED_KEY] = timezone.now().isoformat()
        session[IMPERSONATION_ROLE_KEY] = 'driver'
        session.save()
        self.assertEqual(client.get(self.cart_url).data['item_count'], 1)
        response = client.post(self.items_url, {'product_id': self.jacket.pk}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(client.delete(self.item_url(self.mug.pk)).status_code, 403)
        self.assertEqual(client.delete(self.cart_url).status_code, 403)
        self.assertEqual(CartItem.objects.filter(driver=self.driver).count(), 1)

    def test_clear_cart_removes_every_item(self):
        self.add(self.mug)
        self.add(self.jacket)

        response = self.client.delete(self.cart_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['item_count'], 0)
        self.assertEqual(response.data['total_points'], 0)
        self.assertEqual(response.data['point_balance'], 3000)
        self.assertFalse(CartItem.objects.filter(driver=self.driver).exists())

    def test_clearing_an_empty_cart_is_harmless(self):
        response = self.client.delete(self.cart_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['item_count'], 0)

    def test_clear_cart_leaves_other_drivers_carts_alone(self):
        other_user = get_user_model().objects.create_user(username='cart.other.driver')
        other = Driver.objects.create(
            user=other_user, name='Other Driver', sponsor=self.company, status='approved'
        )
        CartItem.objects.create(driver=other, product=self.mug)
        self.add(self.jacket)

        self.assertEqual(self.client.delete(self.cart_url).status_code, 200)
        self.assertTrue(CartItem.objects.filter(driver=other, product=self.mug).exists())

    def test_pending_drivers_cannot_clear_a_cart(self):
        CartItem.objects.create(driver=self.driver, product=self.mug)
        Driver.objects.filter(pk=self.driver.pk).update(status='pending')
        self.refresh_login()
        response = self.client.delete(self.cart_url)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'driver_not_approved')
        self.assertTrue(CartItem.objects.filter(driver=self.driver).exists())

    def test_leaving_sponsor_empties_the_cart(self):
        CartItem.objects.create(driver=self.driver, product=self.mug)
        remove_driver_from_sponsor(
            driver=self.driver, changed_by_user=self.sponsor, reason='Left the company'
        )
        self.assertFalse(CartItem.objects.filter(driver=self.driver).exists())

    def test_admin_reassignment_empties_the_cart(self):
        CartItem.objects.create(driver=self.driver, product=self.mug)
        reassign_driver_sponsor(
            driver=self.driver, new_sponsor=self.other_company, changed_by_user=self.admin
        )
        self.assertFalse(CartItem.objects.filter(driver=self.driver).exists())

    def test_stale_rows_from_another_sponsor_never_show(self):
        CartItem.objects.create(driver=self.driver, product=self.foreign)
        self.assertEqual(self.client.get(self.cart_url).data['item_count'], 0)

    def test_catalog_marks_products_in_cart(self):
        self.add(self.mug)
        response = self.client.get(reverse('catalog:browse'))
        in_cart = {p['id']: p['in_cart'] for p in response.data['results']}
        self.assertTrue(in_cart[self.mug.pk])
        self.assertFalse(in_cart[self.jacket.pk])

    def test_cart_survives_signing_out_and_back_in(self):
        self.add(self.mug)
        self.add(self.jacket)
        first_session = APIClient()
        first_session.force_login(self.driver_user)
        self.assertEqual(first_session.get(self.cart_url).data['item_count'], 2)
        first_session.logout()

        second_session = APIClient()
        second_session.force_login(self.driver_user)
        response = second_session.get(self.cart_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['product']['name'] for row in response.data['results']], ['Jacket', 'Mug'])
        self.assertEqual(response.data['total_points'], 5250)

    def test_reward_that_goes_out_of_stock_stays_flagged_and_cannot_be_bought(self):
        self.add(self.mug)
        CatalogProduct.objects.filter(pk=self.mug.pk).update(is_available=False)

        cart = self.client.get(self.cart_url).data
        self.assertEqual(cart['item_count'], 1)
        self.assertFalse(cart['results'][0]['product']['is_available'])

        review = self.client.post(reverse('catalog:cart-review'), {}, format='json')
        response = self.client.post(
            reverse('catalog:cart-checkout'),
            {'review_token': review.data.get('review_token', '')},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'cart_has_unavailable')
        self.assertEqual(Driver.objects.get(pk=self.driver.pk).point_balance, 3000)
        self.assertTrue(CartItem.objects.filter(driver=self.driver, product=self.mug).exists())

    def test_sponsor_catalog_has_no_cart_state(self):
        self.client.force_authenticate(self.sponsor)
        response = self.client.get(reverse('catalog:browse'))
        self.assertTrue(all(p['in_cart'] is None for p in response.data['results']))


class CartCheckoutApiTests(APITestCase):
    url = reverse('catalog:cart-checkout')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Checkout Sponsor', points_per_dollar=100)
        cls.sponsor = User.objects.create_user(username='checkout.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        MFASettings.objects.create(user=cls.sponsor, totp_enabled=True)
        cls.admin = User.objects.create_user(username='checkout.admin', is_staff=True)
        MFASettings.objects.create(user=cls.admin, totp_enabled=True)
        cls.driver_user = User.objects.create_user(username='checkout.driver')
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Checkout Driver', sponsor=cls.company, status='approved'
        )
        cls.mug = CatalogProduct.objects.create(sponsor=cls.company, name='Mug', price_usd='12.50')
        cls.jacket = CatalogProduct.objects.create(
            sponsor=cls.company, name='Jacket', price_usd='40.00'
        )
        cls.sticker = CatalogProduct.objects.create(
            sponsor=cls.company, name='Sticker', price_usd='0.00'
        )
        PointTransaction.objects.create(
            driver=cls.driver,
            sponsor=cls.company,
            changed_by_user=cls.sponsor,
            point_change=6000,
            reason='Safe driving',
        )

    def setUp(self):
        self.client.force_authenticate(self.driver_user)

    def fill(self, *products):
        for product in products:
            CartItem.objects.create(driver=self.driver, product=product)

    def checkout(self, client=None):
        client = client or self.client
        review = client.post(reverse('catalog:cart-review'), {}, format='json')
        if review.status_code != 200:
            return review
        with self.captureOnCommitCallbacks(execute=True):
            return client.post(self.url, {'review_token': review.data['review_token']}, format='json')

    def balance(self):
        return Driver.objects.get(pk=self.driver.pk).point_balance

    def test_checkout_spends_points_and_empties_the_cart(self):
        self.fill(self.mug, self.jacket)
        response = self.checkout()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['item_count'], 0)
        self.assertEqual(response.data['point_balance'], 750)
        self.assertEqual(response.data['purchase']['points_spent'], 5250)
        self.assertEqual(response.data['purchase']['point_balance'], 750)
        self.assertEqual(response.data['purchase']['reference'], Redemption.objects.get(driver=self.driver).sale.reference)
        self.assertFalse(response.data['purchase']['replayed'])
        self.assertCountEqual(response.data['purchase']['items'], ['Mug', 'Jacket'])
        self.assertEqual(self.balance(), 750)
        self.assertFalse(CartItem.objects.filter(driver=self.driver).exists())
        redemption = Redemption.objects.get(driver=self.driver)
        self.assertEqual(redemption.total_points, 5250)
        self.assertEqual(redemption.sponsor, self.company)
        self.assertCountEqual(
            RedemptionItem.objects.filter(redemption=redemption).values_list('product_name', flat=True),
            ['Mug', 'Jacket'],
        )
        self.assertEqual(redemption.sale.gross_amount_usd, 52.50)
        self.assertEqual(str(redemption.sale.project_share_usd), '0.5250')

        entry = PointTransaction.objects.filter(driver=self.driver).latest('changed_at')
        self.assertEqual(entry.point_change, -5250)
        self.assertEqual(entry.changed_by_user, self.driver_user)
        self.assertTrue(entry.reason.startswith('Reward purchase: '))
        alert = Notification.objects.get(user=self.driver_user)
        self.assertEqual(alert.category, Notification.REWARD_PURCHASE)
        self.assertEqual(
            alert.message,
            'Order confirmed. Items: Jacket (4,000 points), Mug (1,250 points). '
            'Points used: 5,250 points. New balance: 750 points.',
        )

    def test_failed_checkouts_change_nothing(self):
        cases = (
            ('empty', ()),
            ('insufficient', (self.mug, self.jacket)),
            ('unavailable', (self.mug,)),
        )
        for name, products in cases:
            with self.subTest(name):
                CartItem.objects.all().delete()
                self.fill(*products)
                if name == 'insufficient':
                    CatalogProduct.objects.filter(pk=self.jacket.pk).update(price_usd='100.00')
                if name == 'unavailable':
                    CatalogProduct.objects.filter(pk=self.mug.pk).update(is_available=False)
                response = self.checkout()
                self.assertEqual(response.status_code, 400)
                self.assertEqual(self.balance(), 6000)
                self.assertEqual(CartItem.objects.filter(driver=self.driver).count(), len(products))
                self.assertFalse(Notification.objects.exists())
                self.assertFalse(Redemption.objects.exists())
                self.assertFalse(CompletedSale.objects.exists())

    def test_repeating_the_same_checkout_key_returns_original_receipt_once(self):
        self.fill(self.mug)
        key = str(uuid4())
        token = self.client.post(reverse('catalog:cart-review'), {}, format='json').data['review_token']
        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post(self.url, {'idempotency_key': key, 'review_token': token}, format='json')
            second = self.client.post(self.url, {'idempotency_key': key}, format='json')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['purchase']['reference'], second.data['purchase']['reference'])
        self.assertTrue(second.data['purchase']['replayed'])
        self.assertEqual(Redemption.objects.count(), 1)
        self.assertEqual(CompletedSale.objects.count(), 1)
        self.assertEqual(PointTransaction.objects.filter(point_change__lt=0).count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_checkout_refuses_browser_supplied_prices_and_totals(self):
        self.fill(self.mug)
        for payload in ({'price_usd': '0.00'}, {'total_points': 0}, {'idempotency_key': 'bad'}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post(self.url, payload, format='json').status_code, 400)
        self.assertEqual(Redemption.objects.count(), 0)
        self.assertEqual(self.balance(), 6000)

    def test_changed_price_or_cart_requires_new_review_without_spending(self):
        self.fill(self.mug)
        token = self.client.post(reverse('catalog:cart-review'), {}, format='json').data['review_token']
        CatalogProduct.objects.filter(pk=self.mug.pk).update(price_usd='13.00')
        response = self.client.post(self.url, {'review_token': token}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'review_changed')
        self.assertEqual(response.data['review']['total_points'], 1300)
        self.assertEqual(self.balance(), 6000)
        self.assertFalse(Redemption.objects.exists())
        # Even a same-total replacement is a different reviewed purchase.
        token = response.data['review']['review_token']
        CartItem.objects.all().delete()
        self.fill(self.sticker)
        CatalogProduct.objects.filter(pk=self.sticker.pk).update(price_usd='13.00')
        self.assertEqual(self.client.post(self.url, {'review_token': token}, format='json').status_code, 409)

    def test_missing_tampered_and_expired_reviews_cannot_spend_points(self):
        self.fill(self.mug)
        token = self.client.post(reverse('catalog:cart-review'), {}, format='json').data['review_token']
        for payload in ({}, {'review_token': token + 'tampered'}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post(self.url, payload, format='json').status_code, 409)
        with patch('catalog.services.cart.signing.loads', side_effect=signing.SignatureExpired()):
            self.assertEqual(self.client.post(self.url, {'review_token': token}, format='json').status_code, 409)
        self.assertEqual(self.balance(), 6000)
        self.assertFalse(Redemption.objects.exists())

    def test_lookup_returns_snapshot_only_to_owning_driver(self):
        self.fill(self.mug)
        key = str(uuid4())
        token = self.client.post(reverse('catalog:cart-review'), {}, format='json').data['review_token']
        bought = self.client.post(self.url, {'review_token': token, 'idempotency_key': key}, format='json')
        CatalogProduct.objects.filter(pk=self.mug.pk).update(name='Renamed Mug', price_usd='99.00')
        url = reverse('catalog:redemption-lookup', args=[key])
        receipt = self.client.get(url)
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(receipt.data['purchase']['reference'], bought.data['purchase']['reference'])
        self.assertEqual(receipt.data['purchase']['line_items'], [{'name': 'Mug', 'unit_points': 1250, 'quantity': 1}])
        Driver.objects.filter(pk=self.driver.pk).update(sponsor=None)
        self.assertEqual(self.client.get(url).status_code, 200)
        other_user = get_user_model().objects.create_user(username='lookup.other')
        Driver.objects.create(user=other_user, name='Other', sponsor=self.company, status='approved')
        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_cancellation_blocks_delayed_checkout_and_leaves_cart_ready_for_a_new_purchase(self):
        self.fill(self.mug)
        key = uuid4()
        review_url = reverse('catalog:cart-review')
        token = self.client.post(review_url, {}, format='json').data['review_token']
        cancel_url = reverse('catalog:checkout-cancel', args=[key])

        for _ in range(2):
            cancelled = self.client.post(cancel_url, {}, format='json')
            self.assertEqual(cancelled.status_code, 200)
            self.assertEqual(cancelled.data, {'status': 'cancelled'})

        delayed = self.client.post(self.url, {
            'review_token': token, 'idempotency_key': str(key),
        }, format='json')
        self.assertEqual(delayed.status_code, 409)
        self.assertEqual(delayed.data['code'], 'checkout_cancelled')
        self.assertEqual(self.balance(), 6000)
        self.assertTrue(CartItem.objects.filter(driver=self.driver, product=self.mug).exists())
        self.assertFalse(CompletedSale.objects.exists())

        new_token = self.client.post(review_url, {}, format='json').data['review_token']
        purchased = self.client.post(self.url, {
            'review_token': new_token, 'idempotency_key': str(uuid4()),
        }, format='json')
        self.assertEqual(purchased.status_code, 200)
        self.assertEqual(self.balance(), 4750)

    def test_cancellation_returns_completed_receipt_only_to_its_driver_after_unlinking(self):
        self.fill(self.mug)
        key = uuid4()
        token = self.client.post(reverse('catalog:cart-review'), {}, format='json').data['review_token']
        bought = self.client.post(self.url, {
            'review_token': token, 'idempotency_key': str(key),
        }, format='json')
        self.assertEqual(bought.status_code, 200)
        Driver.objects.filter(pk=self.driver.pk).update(sponsor=None)
        cancel_url = reverse('catalog:checkout-cancel', args=[key])
        completed = self.client.post(cancel_url, {}, format='json')
        self.assertEqual(completed.data, {'status': 'completed', 'purchase': bought.data['purchase']})

        other_user = get_user_model().objects.create_user(username='cancel.other')
        Driver.objects.create(user=other_user, name='Other', sponsor=self.company, status='approved')
        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.post(cancel_url, {}, format='json').data, {'status': 'cancelled'})
        self.assertEqual(self.balance(), 4750)
        self.assertEqual(Redemption.objects.count(), 1)

    def test_free_cart_is_cleared_without_a_ledger_entry(self):
        self.fill(self.sticker)
        response = self.checkout()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['purchase']['points_spent'], 0)
        self.assertEqual(PointTransaction.objects.filter(driver=self.driver).count(), 1)
        self.assertFalse(CartItem.objects.exists())
        self.assertEqual(Redemption.objects.get(driver=self.driver).sale.gross_amount_usd, 0)

    def test_purchase_alert_preference_suppresses_the_alert_and_email(self):
        self.with_email()
        DriverNotificationPreferences.objects.create(
            driver=self.driver, reward_purchase_enabled=False
        )
        self.fill(self.mug)
        self.assertEqual(self.checkout().status_code, 200)
        self.assertFalse(Notification.objects.exists())
        self.assertEqual(mail.outbox, [])

    def test_points_removed_preference_does_not_stop_purchase_confirmations(self):
        DriverNotificationPreferences.objects.create(
            driver=self.driver, points_removed_enabled=False
        )
        self.fill(self.mug)
        self.assertEqual(self.checkout().status_code, 200)
        alert = Notification.objects.get(user=self.driver_user)
        self.assertEqual(alert.category, Notification.REWARD_PURCHASE)

    def with_email(self):
        get_user_model().objects.filter(pk=self.driver_user.pk).update(email='driver@example.com')
        self.driver_user.refresh_from_db()
        self.client.force_authenticate(self.driver_user)

    def test_checkout_emails_an_itemized_confirmation(self):
        self.with_email()
        self.fill(self.mug, self.jacket)
        self.assertEqual(self.checkout().status_code, 200)

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['driver@example.com'])
        self.assertEqual(email.subject, 'Your Good Driver reward order is confirmed')
        self.assertIn('Items ordered:\n  - Jacket: 4,000 points\n  - Mug: 1,250 points', email.body)
        self.assertIn('Points used: 5,250 points\nNew balance: 750 points', email.body)
        self.assertNotIn('REDEMPTION', email.body)

    def test_free_order_email_shows_zero_points_used(self):
        self.with_email()
        self.fill(self.sticker)
        self.assertEqual(self.checkout().status_code, 200)
        self.assertIn('  - Sticker: 0 points', mail.outbox[0].body)
        self.assertIn('Points used: 0 points\nNew balance: 6,000 points', mail.outbox[0].body)

    def test_email_preference_off_keeps_only_the_in_app_alert(self):
        self.with_email()
        DriverNotificationPreferences.objects.create(driver=self.driver, email_enabled=False)
        self.fill(self.mug)
        self.assertEqual(self.checkout().status_code, 200)
        self.assertEqual(mail.outbox, [])
        self.assertTrue(Notification.objects.filter(user=self.driver_user).exists())

    def test_long_orders_are_shortened_to_fit_the_alert(self):
        purchase = SimpleNamespace(
            line_items=[{'name': f'Reward number {n} ' + 'x' * 40, 'unit_points': 100} for n in range(40)],
            points_spent=4000,
            point_balance=2000,
        )
        notify_reward_purchase(self.driver, purchase)

        message = Notification.objects.get(user=self.driver_user).message
        self.assertLessEqual(len(message), 1000)
        self.assertRegex(message, r', and \d+ more\. Points used: 4,000 points\. New balance: 2,000 points\.$')

    def test_email_failure_does_not_undo_the_purchase(self):
        self.with_email()
        self.fill(self.mug)
        with patch('accounts.services.notify.EmailMessage.send', side_effect=OSError('SMTP down')):
            response = self.checkout()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.balance(), 4750)
        self.assertTrue(Notification.objects.filter(user=self.driver_user).exists())

    def test_view_as_cannot_check_out_or_cancel(self):
        self.fill(self.mug)
        client = APIClient()
        client.force_login(self.admin)
        session = client.session
        session[IMPERSONATION_TARGET_KEY] = self.driver_user.pk
        session[IMPERSONATION_STARTED_KEY] = timezone.now().isoformat()
        session[IMPERSONATION_ROLE_KEY] = 'driver'
        session.save()
        self.assertEqual(self.checkout(client).status_code, 403)
        cancel_url = reverse('catalog:checkout-cancel', args=[uuid4()])
        self.assertEqual(client.post(cancel_url, {}, format='json').status_code, 403)
        self.assertEqual(self.balance(), 6000)

    def test_sponsors_cannot_check_out(self):
        self.client.force_authenticate(self.sponsor)
        self.assertEqual(self.checkout().status_code, 403)
