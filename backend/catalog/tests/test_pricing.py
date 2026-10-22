from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from accounts.models import SponsorCompany
from catalog.pricing import point_cost


class CatalogPricingTests(TestCase):
    def test_exact_decimal_conversion_rounds_up(self):
        for price, rate, expected in (
            ('24.95', 100, 2495), ('24.95', 25, 624), ('0.01', 1, 1),
            ('0.00', 100, 0), ('1.00', 25, 25),
            ('9999999999.99', 100000, 999999999999000),
        ):
            with self.subTest(price=price, rate=rate):
                self.assertEqual(point_cost(Decimal(price), rate), expected)
                self.assertLessEqual(expected, 2 ** 53 - 1)

    def test_rate_validation_and_database_constraints(self):
        for rate in (0, -1, 100001):
            with self.subTest(rate=rate):
                company = SponsorCompany(name=f'Invalid {rate}', points_per_dollar=rate)
                with self.assertRaises(ValidationError):
                    company.full_clean()
                with self.assertRaises(IntegrityError), transaction.atomic():
                    company.save()
        for rate in (1, 100, 100000):
            company = SponsorCompany(name=f'Valid {rate}', points_per_dollar=rate)
            company.full_clean()
            company.save()
