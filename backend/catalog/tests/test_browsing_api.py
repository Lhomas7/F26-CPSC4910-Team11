from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient, APITestCase

from accounts.middleware import (
    IMPERSONATION_ROLE_KEY, IMPERSONATION_STARTED_KEY, IMPERSONATION_TARGET_KEY,
)
from accounts.models import MFASettings, Notification, SponsorAccount, SponsorCompany
from catalog.models import CatalogProduct
from catalog.services import browse_catalog
from drivers.models import Driver, PointTransaction


class CatalogBrowseApiTests(APITestCase):
    url = reverse('catalog:browse')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Browse Sponsor')
        cls.other_company = SponsorCompany.objects.create(name='Other Browse Sponsor')
        cls.sponsor = User.objects.create_user(username='browse.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        MFASettings.objects.create(user=cls.sponsor, totp_enabled=True)
        cls.driver_user = User.objects.create_user(username='browse.driver')
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Browse Driver', sponsor=cls.company, status='approved',
        )
        cls.admin = User.objects.create_user(username='browse.admin', is_staff=True)
        MFASettings.objects.create(user=cls.admin, totp_enabled=True)
        cls.first = CatalogProduct.objects.create(
            sponsor=cls.company, name='A Mug', description='Reusable', price_usd='12.50',
            image_url='https://images.example.com/mug.png',
        )
        cls.unavailable = CatalogProduct.objects.create(
            sponsor=cls.company, name='B Jacket', price_usd='40.00', is_available=False,
        )
        cls.foreign = CatalogProduct.objects.create(
            sponsor=cls.other_company, name='Foreign Reward', price_usd='1.00',
        )
        PointTransaction.objects.create(
            driver=cls.driver, sponsor=cls.company, changed_by_user=cls.sponsor,
            point_change=250, reason='Existing balance',
        )

    def setUp(self):
        self.client.force_authenticate(self.driver_user)

    def test_driver_gets_only_own_catalog_including_unavailable_products(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual([row['id'] for row in response.data['results']], [self.first.pk, self.unavailable.pk])
        self.assertEqual(response.data['sponsor'], {'id': self.company.pk, 'name': self.company.name})
        self.assertEqual(response.data['point_balance'], 250)
        self.assertEqual(response.data['results'][0]['description'], 'Reusable')
        self.assertEqual(response.data['results'][0]['image_url'], self.first.image_url)
        self.assertEqual(response.data['results'][0]['price_usd'], '12.50')
        self.assertFalse(response.data['results'][1]['is_available'])
        self.assertIn('no-store', response['Cache-Control'])

    def test_default_pricing_and_zero_cost(self):
        CatalogProduct.objects.filter(pk=self.first.pk).update(price_usd='0.00')
        response = self.client.get(self.url)
        self.assertEqual(response.data['pricing'], {'status': 'configured', 'points_per_dollar': 100})
        free, expensive = response.data['results']
        self.assertEqual(free['point_cost'], 0)
        self.assertIs(free['can_afford'], True)
        self.assertEqual(expensive['point_cost'], 4000)
        self.assertIs(expensive['can_afford'], False)

    def test_rate_change_reprices_catalog_without_changing_balance(self):
        CatalogProduct.objects.filter(pk=self.first.pk).update(price_usd='24.95')
        self.assertEqual(self.client.get(self.url).data['results'][0]['point_cost'], 2495)
        SponsorCompany.objects.filter(pk=self.company.pk).update(points_per_dollar=25)
        response = self.client.get(self.url)
        self.assertEqual(response.data['pricing']['points_per_dollar'], 25)
        self.assertEqual(response.data['results'][0]['point_cost'], 624)
        self.assertEqual(response.data['point_balance'], 250)
        self.assertEqual(PointTransaction.objects.get(driver=self.driver).point_change, 250)
        self.assertEqual(SponsorCompany.objects.get(pk=self.other_company.pk).points_per_dollar, 100)

    def test_affordability_at_parity_and_one_point_short_is_independent_of_availability(self):
        CatalogProduct.objects.filter(pk=self.first.pk).update(price_usd='2.50', is_available=False)
        CatalogProduct.objects.filter(pk=self.unavailable.pk).update(price_usd='2.51', is_available=True)
        equal, short = self.client.get(self.url).data['results']
        self.assertIs(equal['can_afford'], True)
        self.assertIs(short['can_afford'], False)

    def test_zero_balance_can_afford_only_zero_cost(self):
        PointTransaction.objects.filter(driver=self.driver).delete()
        CatalogProduct.objects.filter(pk=self.first.pk).update(price_usd='0.00')
        free, paid = self.client.get(self.url).data['results']
        self.assertIs(free['can_afford'], True)
        self.assertIs(paid['can_afford'], False)

    def test_sponsor_gets_organization_catalog_without_driver_balance(self):
        self.client.force_authenticate(self.sponsor)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        self.assertIsNone(response.data['point_balance'])
        self.assertEqual(response.data['results'][0]['point_cost'], 1250)
        self.assertTrue(all(row['can_afford'] is None for row in response.data['results']))

    def test_no_point_history_means_zero_balance_not_an_error(self):
        PointTransaction.objects.filter(driver=self.driver).delete()
        self.assertEqual(self.client.get(self.url).data['point_balance'], 0)

    def test_empty_catalog_is_success_with_organization_context(self):
        CatalogProduct.objects.filter(sponsor=self.company).delete()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 0)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['sponsor']['id'], self.company.pk)

    def test_pending_and_unassigned_drivers_are_not_empty_catalog_successes(self):
        for changes, code in (
            ({'status': 'pending'}, 'driver_not_approved'),
            ({'sponsor': None}, 'sponsor_required'),
        ):
            with self.subTest(changes=changes):
                Driver.objects.filter(pk=self.driver.pk).update(status='approved', sponsor=self.company)
                Driver.objects.filter(pk=self.driver.pk).update(**changes)
                self.client.force_authenticate(get_user_model().objects.get(pk=self.driver_user.pk))
                response = self.client.get(self.url)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.data['code'], code)

    def test_other_roles_anonymous_and_inactive_accounts_are_refused(self):
        no_role = get_user_model().objects.create_user(username='browse.no.role')
        inactive = get_user_model().objects.get(pk=self.driver_user.pk)
        inactive.is_active = False
        for user in (self.admin, no_role, None, inactive):
            with self.subTest(user=user):
                self.client.force_authenticate(user)
                self.assertIn(self.client.get(self.url).status_code, (401, 403))

    def test_staff_with_sponsor_relationship_cannot_read_as_sponsor(self):
        SponsorAccount.objects.create(user=self.admin, company=self.company)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_existing_sponsor_and_driver_mfa_policies_apply(self):
        MFASettings.objects.filter(user=self.sponsor).delete()
        self.client.force_authenticate(get_user_model().objects.get(pk=self.sponsor.pk))
        self.assertEqual(self.client.get(self.url).status_code, 403)
        SponsorCompany.objects.filter(pk=self.company.pk).update(driver_mfa_required=True)
        self.client.force_authenticate(get_user_model().objects.get(pk=self.driver_user.pk))
        self.assertEqual(self.client.get(self.url).status_code, 403)
        MFASettings.objects.create(user=self.driver_user, email_enabled=True)
        self.client.force_authenticate(get_user_model().objects.get(pk=self.driver_user.pk))
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_query_parameters_cannot_select_another_organization_or_driver(self):
        for key in ('sponsor', 'sponsor_id', 'company_id', 'driver_id', 'point_balance'):
            response = self.client.get(self.url, {key: self.other_company.pk})
            self.assertEqual(response.status_code, 400)
            self.assertIn(key, response.data)

    def test_pagination_counts_and_pages_only_the_owned_catalog(self):
        first = self.client.get(self.url, {'page_size': 1})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['count'], 2)
        self.assertEqual([row['id'] for row in first.data['results']], [self.first.pk])
        self.assertIsNotNone(first.data['next'])
        self.assertIsNone(first.data['previous'])
        second = self.client.get(self.url, {'page_size': 1, 'page': 2})
        self.assertEqual([row['id'] for row in second.data['results']], [self.unavailable.pk])
        self.assertIsNone(second.data['next'])
        self.assertIsNotNone(second.data['previous'])
        self.assertEqual(self.client.get(self.url, {'page': 999}).status_code, 404)

    def test_page_sizes_are_bounded_and_default_is_25(self):
        CatalogProduct.objects.bulk_create([
            CatalogProduct(sponsor=self.company, name=f'Reward {number:03}', price_usd='1.00')
            for number in range(105)
        ])
        self.assertEqual(len(self.client.get(self.url).data['results']), 25)
        response = self.client.get(self.url, {'page_size': 10000})
        self.assertEqual(response.data['count'], 107)
        self.assertEqual(len(response.data['results']), 100)

    def test_browsing_has_no_point_or_notification_side_effects(self):
        before = (PointTransaction.objects.count(), Notification.objects.count())
        self.client.get(self.url)
        self.assertEqual((PointTransaction.objects.count(), Notification.objects.count()), before)

    def test_browse_endpoint_does_not_accept_mutations(self):
        self.assertEqual(self.client.post(self.url, {}, format='json').status_code, 405)
        self.assertEqual(self.client.patch(self.url, {}, format='json').status_code, 405)

    def test_service_also_enforces_driver_approval_outside_http(self):
        Driver.objects.filter(pk=self.driver.pk).update(status='pending')
        user = get_user_model().objects.get(pk=self.driver_user.pk)
        with self.assertRaises(PermissionDenied):
            browse_catalog(user=user)

    def test_view_as_browsing_uses_effective_target_not_administrator(self):
        for target, role in ((self.driver_user, 'driver'), (self.sponsor, 'sponsor')):
            with self.subTest(role=role):
                client = APIClient()
                client.force_login(self.admin)
                session = client.session
                session[IMPERSONATION_TARGET_KEY] = target.pk
                session[IMPERSONATION_STARTED_KEY] = timezone.now().isoformat()
                session[IMPERSONATION_ROLE_KEY] = role
                session.save()
                response = client.get(self.url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data['count'], 2)
                self.assertEqual(response.data['sponsor']['id'], self.company.pk)
                self.assertEqual(response.data['point_balance'], 250 if role == 'driver' else None)
