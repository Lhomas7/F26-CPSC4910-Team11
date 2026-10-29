from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase

from accounts.models import SponsorCompany
from catalog.models import CatalogProduct


class CatalogProductTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Product Test Sponsor')

    def product(self, **overrides):
        values = {'sponsor': self.company, 'name': 'Reward', 'price_usd': Decimal('19.95')}
        values.update(overrides)
        return CatalogProduct(**values)

    def test_valid_product_round_trips_exact_money_and_optional_image(self):
        product = self.product()
        product.full_clean()
        product.save()
        product.refresh_from_db()
        self.assertEqual(product.price_usd, Decimal('19.95'))
        self.assertEqual(product.image_url, '')
        self.assertTrue(product.is_available)
        self.assertEqual(product.sponsor_id, self.company.pk)
        self.assertIsNotNone(product.created_at)
        self.assertIsNotNone(product.updated_at)
        self.assertEqual(str(product), 'Reward')

    def test_zero_price_is_valid_but_missing_negative_or_overprecise_prices_are_not(self):
        self.product(price_usd=Decimal('0.00')).full_clean()
        for price in (None, Decimal('-0.01'), Decimal('1.234'), Decimal('10000000000.00')):
            with self.subTest(price=price):
                with self.assertRaises(ValidationError) as error:
                    self.product(price_usd=price).full_clean()
                self.assertIn('price_usd', error.exception.message_dict)

    def test_database_refuses_negative_prices_even_when_validation_is_bypassed(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.product(price_usd=Decimal('-1.00')).save()

    def test_name_validation_and_normalization(self):
        product = self.product(name='  Travel Mug  ')
        product.full_clean()
        self.assertEqual(product.name, 'Travel Mug')
        for name in (None, '', ' \t\n ', 'x' * 201):
            with self.subTest(name=name):
                with self.assertRaises(ValidationError) as error:
                    self.product(name=name).full_clean()
                self.assertIn('name', error.exception.message_dict)

    def test_database_refuses_empty_names(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.product(name='').save()

    def test_image_urls_are_optional_https_references_not_uploads(self):
        self.product(image_url='https://images.example.com/reward.webp').full_clean()
        for url in (
            'http://images.example.com/reward.png',
            'javascript:alert(1)',
            'data:image/png;base64,abc',
            '/media/reward.png',
            'not a url',
        ):
            with self.subTest(url=url):
                with self.assertRaises(ValidationError) as error:
                    self.product(image_url=url).full_clean()
                self.assertIn('image_url', error.exception.message_dict)

    def test_description_has_a_bounded_length(self):
        self.product(description='x' * 5000).full_clean()
        with self.assertRaises(ValidationError):
            self.product(description='x' * 5001).full_clean()

    def test_sponsor_is_required_and_cannot_be_deleted_with_products(self):
        with self.assertRaises(ValidationError):
            self.product(sponsor=None).full_clean()
        product = self.product()
        product.save()
        with self.assertRaises(ProtectedError):
            self.company.delete()

    def test_same_name_is_allowed_in_separate_sponsor_catalogs(self):
        other = SponsorCompany.objects.create(name='Second Product Sponsor')
        self.product().save()
        product = self.product(sponsor=other)
        product.full_clean()
        product.save()
        self.assertEqual(CatalogProduct.objects.count(), 2)

    def test_manual_availability_does_not_overwrite_product_details(self):
        product = self.product()
        product.save()
        old_updated_at = product.updated_at
        product.is_available = False
        product.save()
        product.refresh_from_db()
        self.assertFalse(product.is_available)
        self.assertEqual(product.price_usd, Decimal('19.95'))
        self.assertGreaterEqual(product.updated_at, old_updated_at)

    def test_point_cost_and_conversion_rate_are_not_invented(self):
        fields = {field.name for field in CatalogProduct._meta.get_fields()}
        self.assertNotIn('point_cost', fields)
        self.assertNotIn('conversion_rate', fields)
