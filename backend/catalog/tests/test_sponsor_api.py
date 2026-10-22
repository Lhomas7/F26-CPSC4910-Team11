from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIClient, APITestCase

from accounts.models import MFASettings, SponsorAccount, SponsorCompany
from accounts.middleware import (
    IMPERSONATION_ROLE_KEY, IMPERSONATION_STARTED_KEY, IMPERSONATION_TARGET_KEY,
)
from catalog.models import CatalogProduct
from catalog.services import create_catalog_product, update_product_availability
from drivers.models import Driver


class SponsorCatalogApiTests(APITestCase):
    url = reverse('catalog:sponsor-product-create')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='API Catalog Sponsor')
        cls.other_company = SponsorCompany.objects.create(name='API Other Sponsor')
        cls.sponsor = User.objects.create_user(username='api.catalog.sponsor')
        cls.colleague = User.objects.create_user(username='api.catalog.colleague')
        cls.outsider = User.objects.create_user(username='api.catalog.outsider')
        for user, company in (
            (cls.sponsor, cls.company), (cls.colleague, cls.company),
            (cls.outsider, cls.other_company),
        ):
            SponsorAccount.objects.create(user=user, company=company)
            MFASettings.objects.create(user=user, totp_enabled=True)
        cls.admin = User.objects.create_user(username='api.catalog.admin', is_staff=True)
        MFASettings.objects.create(user=cls.admin, totp_enabled=True)
        cls.driver = User.objects.create_user(username='api.catalog.driver')
        Driver.objects.create(user=cls.driver, name='API Driver', sponsor=cls.company, status='approved')
        cls.product = CatalogProduct.objects.create(
            sponsor=cls.company, name='Travel Mug', description='Reusable mug',
            price_usd=Decimal('12.50'), image_url='https://images.example.com/mug.png',
        )

    def setUp(self):
        self.client.force_authenticate(self.sponsor)

    def availability_url(self, product_id=None):
        return reverse('catalog:sponsor-product-availability', kwargs={
            'product_id': self.product.pk if product_id is None else product_id,
        })

    def payload(self, **overrides):
        data = {'name': 'Safety Jacket', 'price_usd': '49.95'}
        data.update(overrides)
        return data

    def test_create_assigns_server_side_ownership_and_returns_exact_price(self):
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        product = CatalogProduct.objects.get(pk=response.data['id'])
        self.assertEqual(product.sponsor_id, self.company.pk)
        self.assertEqual(product.price_usd, Decimal('49.95'))
        self.assertEqual(response.data['price_usd'], '49.95')
        self.assertTrue(response.data['is_available'])
        self.assertEqual(response.data['image_url'], '')
        self.assertNotIn('point_cost', response.data)
        self.assertNotIn('sponsor', response.data)
        self.assertIn('no-store', response['Cache-Control'])

    def test_create_normalizes_unicode_name_and_preserves_description_paragraphs(self):
        response = self.client.post(self.url, self.payload(
            name='  Ｔｒａｖｅｌ\t  Mug  ', description='  First line.\r\n\r\nSecond line.  ',
        ), format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['name'], 'Travel Mug')
        self.assertEqual(response.data['description'], 'First line.\n\nSecond line.')

    def test_optional_image_and_explicit_unavailable_state(self):
        response = self.client.post(self.url, self.payload(
            image_url='https://images.example.com/jacket.webp', is_available=False, price_usd='0.00',
        ), format='json')
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data['is_available'])
        self.assertEqual(response.data['price_usd'], '0.00')

    def test_create_rejects_spoofed_ownership_and_unsupported_fields(self):
        before = CatalogProduct.objects.count()
        for field in ('sponsor', 'sponsor_id', 'company_id', 'id', 'point_cost', 'provider_id'):
            with self.subTest(field=field):
                response = self.client.post(self.url, self.payload(**{field: self.other_company.pk}), format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertEqual(CatalogProduct.objects.count(), before)

    def test_invalid_products_do_not_create_rows(self):
        before = CatalogProduct.objects.count()
        invalid = (
            ('name', ''), ('name', ' \t\n '), ('name', 123), ('name', 'x' * 201),
            ('name', 'Bad\x00Name'), ('price_usd', '-0.01'), ('price_usd', '1.234'),
            ('price_usd', '10000000000.00'), ('price_usd', None), ('price_usd', 'NaN'),
            ('description', 'x' * 5001), ('description', 'Bad\x00Description'),
            ('image_url', 'http://images.example.com/x.png'), ('image_url', 'javascript:alert(1)'),
            ('image_url', '/media/x.png'), ('image_url', 'not-a-url'),
            ('is_available', 'false'), ('is_available', 1), ('is_available', None),
        )
        for field, value in invalid:
            with self.subTest(field=field, value=value):
                response = self.client.post(self.url, self.payload(**{field: value}), format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertEqual(CatalogProduct.objects.count(), before)

    def test_create_requires_name_and_price_and_an_object_body(self):
        for payload in ({}, {'name': 'Missing price'}, {'price_usd': '1.00'}, []):
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format='json')
                self.assertEqual(response.status_code, 400)

    def test_availability_can_be_disabled_and_reenabled_without_changing_details(self):
        original = (self.product.name, self.product.description, self.product.image_url, self.product.price_usd)
        for available in (False, True):
            response = self.client.patch(self.availability_url(), {'is_available': available}, format='json')
            self.assertEqual(response.status_code, 200)
            self.product.refresh_from_db()
            self.assertEqual(self.product.is_available, available)
            self.assertEqual(
                (self.product.name, self.product.description, self.product.image_url, self.product.price_usd),
                original,
            )
            self.assertIn('no-store', response['Cache-Control'])

    def test_repeated_availability_value_is_a_noop(self):
        updated_at = self.product.updated_at
        response = self.client.patch(self.availability_url(), {'is_available': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.updated_at, updated_at)

    def test_availability_rejects_missing_boolean_and_arbitrary_edits(self):
        for payload in ({}, {'is_available': 'false'}, {'is_available': 0}, {'is_available': None},
                        {'is_available': False, 'name': 'Changed'},
                        {'is_available': False, 'sponsor_id': self.other_company.pk},
                        {'is_available': False, 'price_usd': '0.00'}):
            with self.subTest(payload=payload):
                response = self.client.patch(self.availability_url(), payload, format='json')
                self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_available)
        self.assertEqual(self.product.name, 'Travel Mug')

    def test_other_organization_and_missing_ids_both_return_404(self):
        self.client.force_authenticate(self.outsider)
        for product_id in (self.product.pk, self.product.pk + 10000):
            response = self.client.patch(self.availability_url(product_id), {'is_available': False}, format='json')
            self.assertEqual(response.status_code, 404)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_available)

    def test_sponsors_share_their_organization_catalog_not_a_personal_catalog(self):
        self.client.force_authenticate(self.colleague)
        response = self.client.patch(self.availability_url(), {'is_available': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_available)

    def test_driver_admin_anonymous_and_inactive_accounts_cannot_mutate(self):
        inactive = get_user_model().objects.get(pk=self.sponsor.pk)
        inactive.is_active = False
        for user in (self.driver, self.admin, None, inactive):
            self.client.force_authenticate(user)
            with self.subTest(user=user):
                self.assertIn(self.client.post(self.url, self.payload(), format='json').status_code, (401, 403))
                self.assertIn(self.client.patch(self.availability_url(), {'is_available': False}, format='json').status_code, (401, 403))
        self.assertEqual(CatalogProduct.objects.count(), 1)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_available)

    def test_sponsor_mfa_is_required_for_both_actions(self):
        MFASettings.objects.filter(user=self.sponsor).delete()
        self.client.force_authenticate(get_user_model().objects.get(pk=self.sponsor.pk))
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 403)
        self.assertEqual(self.client.patch(self.availability_url(), {'is_available': False}, format='json').status_code, 403)

    def test_staff_with_sponsor_relationship_cannot_mutate(self):
        SponsorAccount.objects.create(user=self.admin, company=self.company)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 403)
        self.assertEqual(self.client.patch(self.availability_url(), {'is_available': False}, format='json').status_code, 403)

    def test_unsupported_methods_are_not_product_edit_or_delete_endpoints(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)
        self.assertEqual(self.client.put(self.availability_url(), {}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(self.availability_url()).status_code, 405)

    def test_services_enforce_authorization_and_validation_outside_http_views(self):
        with self.assertRaises(PermissionDenied):
            create_catalog_product(user=self.driver, data=self.payload())
        with self.assertRaises(ValidationError):
            create_catalog_product(user=self.sponsor, data=self.payload(price_usd='-1.00'))
        with self.assertRaises(ValidationError):
            update_product_availability(user=self.sponsor, product_id=self.product.pk, data={})

    def test_session_authenticated_mutations_still_require_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.sponsor)
        responses = (
            client.post(self.url, self.payload(), format='json'),
            client.patch(self.availability_url(), {'is_available': False}, format='json'),
        )
        for response in responses:
            self.assertEqual(response.status_code, 403)
            self.assertIn('CSRF', str(response.data))

    def view_as_client(self, target, role):
        client = APIClient()
        client.force_login(self.admin)
        session = client.session
        session[IMPERSONATION_TARGET_KEY] = target.pk
        session[IMPERSONATION_STARTED_KEY] = timezone.now().isoformat()
        session[IMPERSONATION_ROLE_KEY] = role
        session.save()
        return client

    def test_admin_viewing_as_sponsor_can_use_only_target_organization(self):
        client = self.view_as_client(self.outsider, 'sponsor')
        created = client.post(self.url, self.payload(), format='json')
        self.assertEqual(created.status_code, 201)
        self.assertEqual(
            CatalogProduct.objects.get(pk=created.data['id']).sponsor_id,
            self.other_company.pk,
        )
        response = client.patch(self.availability_url(), {'is_available': False}, format='json')
        self.assertEqual(response.status_code, 404)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_available)

    def test_admin_viewing_as_driver_has_no_sponsor_mutation_privileges(self):
        client = self.view_as_client(self.driver, 'driver')
        self.assertEqual(client.post(self.url, self.payload(), format='json').status_code, 403)
        self.assertEqual(client.patch(self.availability_url(), {'is_available': False}, format='json').status_code, 403)
