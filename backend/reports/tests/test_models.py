from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from accounts.models import SponsorCompany
from drivers.models import Driver
from reports.models import CompletedSale


class CompletedSaleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sponsor = SponsorCompany.objects.create(name='Sales Test Sponsor')
        cls.driver = Driver.objects.create(
            user=User.objects.create_user(username='sales-driver'),
            name='Sales Driver',
            sponsor=cls.sponsor,
            status='approved',
        )

    def sale(self, **overrides):
        values = {
            'sponsor': self.sponsor,
            'driver': self.driver,
            'reference': 'SALE-1001',
            'gross_amount_usd': Decimal('24.95'),
            'completed_at': timezone.now(),
        }
        values.update(overrides)
        return CompletedSale(**values)

    def test_sale_snapshots_exact_one_percent_project_share(self):
        sale = self.sale()
        sale.full_clean(exclude=('project_share_usd',))
        sale.save()
        sale.refresh_from_db()
        self.assertEqual(sale.gross_amount_usd, Decimal('24.95'))
        self.assertEqual(sale.project_share_usd, Decimal('0.2495'))
        self.assertEqual(str(sale), 'SALE-1001')

    def test_zero_and_large_sales_keep_exact_four_decimal_share(self):
        zero = self.sale(reference='SALE-ZERO', gross_amount_usd=Decimal('0.00'))
        zero.save()
        large = self.sale(reference='SALE-LARGE', gross_amount_usd=Decimal('9999999999.99'))
        large.save()
        self.assertEqual(zero.project_share_usd, Decimal('0.0000'))
        self.assertEqual(large.project_share_usd, Decimal('99999999.9999'))

    def test_database_rejects_negative_money(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.sale(gross_amount_usd=Decimal('-0.01')).save()

    def test_driver_must_belong_to_sale_sponsor(self):
        other = SponsorCompany.objects.create(name='Other Sponsor')
        with self.assertRaises(ValidationError) as error:
            self.sale(sponsor=other).full_clean(exclude=('project_share_usd',))
        self.assertIn('driver', error.exception.message_dict)
        with self.assertRaises(ValidationError):
            self.sale(sponsor=other).save()

    def test_reference_is_normalized_and_required(self):
        sale = self.sale(reference='  SALE-TRIM  ')
        sale.full_clean(exclude=('project_share_usd',))
        self.assertEqual(sale.reference, 'SALE-TRIM')
        with self.assertRaises(ValidationError):
            self.sale(reference='   ').full_clean(exclude=('project_share_usd',))

    def test_saved_sale_cannot_be_changed_or_deleted(self):
        sale = self.sale()
        sale.save()
        sale.gross_amount_usd = Decimal('25.00')
        with self.assertRaisesMessage(ValidationError, 'immutable'):
            sale.save()
        with self.assertRaisesMessage(ValidationError, 'immutable'):
            sale.delete()

    def test_queryset_writes_cannot_bypass_audit_guards(self):
        sale = self.sale()
        sale.save()
        with self.assertRaises(ValidationError):
            CompletedSale.objects.filter(pk=sale.pk).update(gross_amount_usd=Decimal('0.00'))
        with self.assertRaises(ValidationError):
            CompletedSale.objects.filter(pk=sale.pk).delete()
        with self.assertRaises(ValidationError):
            CompletedSale.objects.bulk_create([self.sale(reference='BULK')])

    def test_historical_sale_survives_driver_transfer(self):
        sale = self.sale()
        sale.save()
        other = SponsorCompany.objects.create(name='Transferred Sponsor')
        self.driver.sponsor = other
        self.driver.save()
        sale.refresh_from_db()
        sale.save()
        self.assertEqual(sale.sponsor_id, self.sponsor.pk)
        self.assertEqual(sale.project_share_usd, Decimal('0.2495'))
