import csv
import io
from datetime import datetime

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver, DriverStatusChange, PointTransaction

from ..models import AdminPasswordResetEvent, LoginAttempt, SponsorCompany
from .common import enroll_totp

PASSWORD = 'ExamplePassword123!'


def at(year, month, day, hour=12, minute=0):
    return timezone.make_aware(datetime(year, month, day, hour, minute))


class ReportTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='report.admin', password=PASSWORD, is_staff=True)
        enroll_totp(cls.admin)
        cls.driver_user = User.objects.create_user(username='report.driver', password=PASSWORD)
        cls.company = SponsorCompany.objects.create(name='Report Freight', points_per_dollar=100)
        cls.other_company = SponsorCompany.objects.create(name='Other Freight', points_per_dollar=100)
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Report Driver', sponsor=cls.company, status='approved'
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def points(self, amount, when, *, company=None, driver=None, reason='Safe driving'):
        row = PointTransaction.objects.create(
            driver=driver or self.driver,
            sponsor=company or self.company,
            changed_by_user=self.admin,
            point_change=amount,
            reason=reason,
        )
        PointTransaction.objects.filter(pk=row.pk).update(changed_at=when)
        return row


class ReportAccessTests(ReportTestCase):
    def test_only_enrolled_admins_can_open_reports(self):
        unenrolled = get_user_model().objects.create_user(
            username='report.bare', password=PASSWORD, is_staff=True
        )
        for url in (
            reverse('accounts:admin-audit-log'),
            reverse('accounts:admin-invoice') + f'?sponsor={self.company.pk}&start=2026-10-01&end=2026-10-31',
        ):
            for user in (None, self.driver_user, unenrolled):
                with self.subTest(url=url, user=getattr(user, 'username', None)):
                    self.client.force_authenticate(user)
                    self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_reports_are_never_cached(self):
        response = self.client.get(reverse('accounts:admin-audit-log'))

        self.assertIn('no-store', response['Cache-Control'])


class AuditLogDateRangeTests(ReportTestCase):
    url = reverse('accounts:admin-audit-log')

    def get(self, **params):
        return self.client.get(self.url, params)

    def test_range_includes_both_end_days_and_nothing_outside(self):
        self.points(1, at(2026, 9, 30, 23, 59), reason='Before')
        self.points(2, at(2026, 10, 1, 0, 0), reason='First instant')
        self.points(3, at(2026, 10, 15), reason='Middle')
        self.points(4, at(2026, 10, 31, 23, 59), reason='Last minute')
        self.points(5, at(2026, 11, 1, 0, 0), reason='After')

        response = self.get(start='2026-10-01', end='2026-10-31', category='points')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reasons = [row['detail'].split('. ', 1)[1] for row in response.data['results']]
        self.assertEqual(reasons, ['Last minute', 'Middle', 'First instant'])
        self.assertEqual(response.data['range'], {'start': '2026-10-01', 'end': '2026-10-31'})

    def test_start_or_end_alone_is_an_open_ended_range(self):
        self.points(1, at(2026, 9, 1), reason='Early')
        self.points(2, at(2026, 10, 15), reason='Late')

        only_start = self.get(start='2026-10-01', category='points').data['results']
        only_end = self.get(end='2026-09-30', category='points').data['results']

        self.assertEqual(len(only_start), 1)
        self.assertIn('Late', only_start[0]['detail'])
        self.assertEqual(len(only_end), 1)
        self.assertIn('Early', only_end[0]['detail'])

    def test_a_single_day_range(self):
        self.points(1, at(2026, 10, 14, 23, 59))
        self.points(2, at(2026, 10, 15, 8, 0))
        self.points(3, at(2026, 10, 16, 0, 0))

        results = self.get(start='2026-10-15', end='2026-10-15', category='points').data['results']

        self.assertEqual(len(results), 1)

    def test_events_from_every_source_are_merged_newest_first(self):
        self.points(10, at(2026, 10, 10))
        status_change = DriverStatusChange.objects.create(
            driver=self.driver,
            sponsor=self.company,
            changed_by_user=self.admin,
            action='dropped',
            reason='Left the company',
        )
        DriverStatusChange.objects.filter(pk=status_change.pk).update(changed_at=at(2026, 10, 11))
        attempt = LoginAttempt.objects.create(
            username='report.driver', user=self.driver_user, successful=False
        )
        LoginAttempt.objects.filter(pk=attempt.pk).update(timestamp=at(2026, 10, 12))
        reset = AdminPasswordResetEvent.objects.create(
            target=self.admin, requested_by=self.admin, action='requested'
        )
        AdminPasswordResetEvent.objects.filter(pk=reset.pk).update(created_at=at(2026, 10, 13))

        results = self.get(start='2026-10-01', end='2026-10-31').data['results']

        self.assertEqual(
            [row['action'] for row in results],
            [
                'admin_password_reset_requested',
                'sign_in_failed',
                'driver_dropped',
                'points_added',
            ],
        )

    def test_category_filter(self):
        self.points(10, at(2026, 10, 10))
        attempt = LoginAttempt.objects.create(username='report.admin', user=self.admin, successful=True)
        LoginAttempt.objects.filter(pk=attempt.pk).update(timestamp=at(2026, 10, 10))

        results = self.get(category='sign_in').data['results']

        self.assertEqual({row['category'] for row in results}, {'sign_in'})

    def test_a_username_that_matches_no_account_is_not_echoed(self):
        # People sometimes type their password into the username box.
        LoginAttempt.objects.create(username='hunter2-secret', successful=False)

        results = self.get(category='sign_in').data['results']

        self.assertEqual(len(results), 1)
        self.assertNotIn('hunter2-secret', str(results))
        self.assertEqual(results[0]['detail'], 'Unknown username')

    def test_bad_dates_are_rejected_with_the_field_named(self):
        self.assertIn('start', self.get(start='10/01/2026').data)
        self.assertIn('end', self.get(end='not-a-date').data)
        self.assertIn('start', self.get(start='1850-01-01').data)
        backwards = self.get(start='2026-10-31', end='2026-10-01')
        self.assertEqual(backwards.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end', backwards.data)

    def test_unknown_category_is_rejected(self):
        self.assertEqual(self.get(category='nope').status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_cut_off_report_says_so(self):
        for index in range(3):
            self.points(index + 1, at(2026, 10, 10, index))

        response = self.get(category='points', limit=2)

        self.assertEqual(len(response.data['results']), 2)
        self.assertTrue(response.data['truncated'])
        self.assertFalse(self.get(category='points', limit=3).data['truncated'])

    def test_csv_export_follows_the_same_filter_and_neutralizes_formulas(self):
        for reason, when in (('=1+1', at(2026, 10, 10)), ('Out of range', at(2026, 8, 10))):
            change = DriverStatusChange.objects.create(
                driver=self.driver,
                sponsor=self.company,
                changed_by_user=self.admin,
                action='dropped',
                reason=reason,
            )
            DriverStatusChange.objects.filter(pk=change.pk).update(changed_at=when)

        response = self.get(
            start='2026-10-01', end='2026-10-31', category='membership', export='csv'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', response['Content-Type'])
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertEqual(rows[0], ['timestamp', 'category', 'action', 'actor', 'target', 'detail'])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][5], "'=1+1")
        self.assertNotIn('Out of range', response.content.decode())


class InvoiceTests(ReportTestCase):
    url = reverse('accounts:admin-invoice')

    def get(self, **params):
        params.setdefault('sponsor', self.company.pk)
        return self.client.get(self.url, params)

    def test_invoice_covers_exactly_the_chosen_billing_period(self):
        self.points(500, at(2026, 9, 30, 23, 59))
        self.points(1000, at(2026, 10, 1, 0, 0))
        self.points(250, at(2026, 10, 31, 23, 59))
        self.points(700, at(2026, 11, 1, 0, 0))

        response = self.get(start='2026-10-01', end='2026-10-31')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['period'], {'start': '2026-10-01', 'end': '2026-10-31'})
        self.assertEqual(response.data['totals']['points_awarded'], 1250)
        self.assertEqual(response.data['totals']['amount_due'], '12.50')
        self.assertEqual(response.data['sponsor'], {'id': self.company.pk, 'name': 'Report Freight'})

    def test_the_same_data_gives_a_different_invoice_for_a_different_period(self):
        self.points(1000, at(2026, 9, 15))
        self.points(300, at(2026, 10, 15))

        september = self.get(start='2026-09-01', end='2026-09-30').data['totals']
        october = self.get(start='2026-10-01', end='2026-10-31').data['totals']

        self.assertEqual((september['points_awarded'], october['points_awarded']), (1000, 300))

    def test_removed_points_are_listed_but_not_credited(self):
        self.points(1000, at(2026, 10, 5))
        self.points(-400, at(2026, 10, 6), reason='Policy violation')

        data = self.get(start='2026-10-01', end='2026-10-31').data

        self.assertEqual(data['totals']['points_awarded'], 1000)
        self.assertEqual(data['totals']['points_removed'], 400)
        self.assertEqual(data['totals']['transactions'], 2)
        self.assertEqual(data['totals']['amount_due'], '10.00')

    def test_lines_are_per_driver_and_only_for_this_sponsor(self):
        second_user = get_user_model().objects.create_user(username='report.driver2', password=PASSWORD)
        second = Driver.objects.create(
            user=second_user, name='Another Driver', sponsor=self.company, status='approved'
        )
        outsider_user = get_user_model().objects.create_user(username='report.out', password=PASSWORD)
        outsider = Driver.objects.create(
            user=outsider_user, name='Outsider', sponsor=self.other_company, status='approved'
        )
        self.points(100, at(2026, 10, 5))
        self.points(50, at(2026, 10, 6))
        self.points(30, at(2026, 10, 7), driver=second)
        self.points(999, at(2026, 10, 8), company=self.other_company, driver=outsider)

        lines = self.get(start='2026-10-01', end='2026-10-31').data['lines']

        self.assertEqual(
            [(line['driver'], line['points_awarded'], line['transactions']) for line in lines],
            [('Another Driver', 30, 1), ('Report Driver', 150, 2)],
        )

    def test_amount_is_rounded_to_the_cent_using_the_sponsors_rate(self):
        self.company.points_per_dollar = 300
        self.company.save()
        self.points(1, at(2026, 10, 5))
        self.points(1, at(2026, 10, 6))

        # 2 points / 300 = $0.00667 -> $0.01
        self.assertEqual(self.get(start='2026-10-01', end='2026-10-31').data['totals']['amount_due'], '0.01')

    def test_an_empty_period_is_a_valid_zero_invoice(self):
        data = self.get(start='2026-10-01', end='2026-10-31').data

        self.assertEqual(data['lines'], [])
        self.assertEqual(data['totals']['amount_due'], '0.00')

    def test_dates_and_sponsor_are_required_and_validated(self):
        self.assertIn('start', self.get(end='2026-10-31').data)
        self.assertIn('end', self.get(start='2026-10-01').data)
        self.assertIn('sponsor', self.client.get(self.url, {'start': '2026-10-01', 'end': '2026-10-31'}).data)
        self.assertEqual(
            self.get(start='2026-10-31', end='2026-10-01').status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertEqual(
            self.get(start='2024-01-01', end='2026-10-31').status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertEqual(
            self.get(sponsor=999999, start='2026-10-01', end='2026-10-31').status_code,
            status.HTTP_404_NOT_FOUND,
        )
