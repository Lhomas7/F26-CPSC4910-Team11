import csv
from decimal import Decimal
from io import BytesIO, StringIO
from xml.etree import ElementTree
from zipfile import ZipFile

from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SponsorAccount, SponsorCompany
from accounts.tests.common import enroll_totp
from drivers.models import Driver
from reports.models import CompletedSale


class SalesReportApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='report.admin',
            password='ExamplePassword123!',
        )
        enroll_totp(cls.admin)
        cls.alpha = SponsorCompany.objects.create(name='Alpha Logistics')
        cls.beta = SponsorCompany.objects.create(name='Beta Transit')
        cls.driver_a = Driver.objects.create(
            user=User.objects.create_user(username='alice.driver'),
            name='Alice Driver',
            sponsor=cls.alpha,
            status='approved',
        )
        cls.driver_b = Driver.objects.create(
            user=User.objects.create_user(username='bob.driver'),
            name='Bob Driver',
            sponsor=cls.alpha,
            status='approved',
        )
        cls.driver_c = Driver.objects.create(
            user=User.objects.create_user(username='cora.driver'),
            name='Cora Driver',
            sponsor=cls.beta,
            status='approved',
        )
        for reference, driver, amount in (
            ('A-1', cls.driver_a, '10.00'),
            ('A-2', cls.driver_a, '24.95'),
            ('B-1', cls.driver_b, '5.05'),
            ('C-1', cls.driver_c, '100.00'),
        ):
            CompletedSale.objects.create(
                sponsor=driver.sponsor,
                driver=driver,
                reference=reference,
                gross_amount_usd=Decimal(amount),
                completed_at=timezone.now(),
            )

    def authenticate_admin(self):
        self.client.force_authenticate(self.admin)

    def test_csv_export_includes_all_grouped_rows_in_applied_scope_and_totals(self):
        self.authenticate_admin()
        scope = {'group_by': 'driver', 'sponsor_id': self.alpha.pk}
        first_page = self.client.get(reverse('reports:sales'), {**scope, 'page_size': 1})
        self.assertEqual(len(first_page.data['results']), 1)
        response = self.client.get(reverse('reports:sales-export'), {**scope, 'file_format': 'csv'})

        self.assertEqual(response.status_code, 200)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertIn(f'sales-by-driver-sponsor-{self.alpha.pk}-', response['Content-Disposition'])
        rows = list(csv.reader(StringIO(response.content.decode('utf-8-sig'))))
        self.assertEqual(
            rows[0],
            [
                'Sponsor',
                'Driver',
                'Username',
                'Completed sales',
                'Gross sales (USD)',
                'Project share (USD)',
            ],
        )
        self.assertEqual([row[1] for row in rows[1:-1]], ['Alice Driver', 'Bob Driver'])
        summary = first_page.data['summary']
        self.assertEqual(
            rows[-1],
            [
                'Total',
                '',
                '',
                str(summary['sale_count']),
                summary['gross_sales_usd'],
                summary['project_share_usd'],
            ],
        )

    def test_exports_keep_formula_like_names_as_text_and_xlsx_money_numeric(self):
        self.authenticate_admin()
        SponsorCompany.objects.filter(pk=self.alpha.pk).update(name='  =1+1, "Example"')
        url = reverse('reports:sales-export')
        scope = {'group_by': 'sponsor', 'sponsor_id': self.alpha.pk}
        csv_response = self.client.get(url, {**scope, 'file_format': 'csv'})
        rows = list(csv.reader(StringIO(csv_response.content.decode('utf-8-sig'))))
        self.assertEqual(rows[1][0], '\'  =1+1, "Example"')

        response = self.client.get(url, {**scope, 'file_format': 'xlsx'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('.xlsx', response['Content-Disposition'])
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        with ZipFile(BytesIO(b''.join(response.streaming_content))) as workbook:
            cells = ElementTree.fromstring(workbook.read('xl/worksheets/sheet1.xml'))
            strings = ElementTree.fromstring(workbook.read('xl/sharedStrings.xml'))
        name = cells.find(".//s:c[@r='A7']", ns)
        gross = cells.find(".//s:c[@r='C7']", ns)
        share = cells.find(".//s:c[@r='D8']", ns)
        self.assertEqual(name.get('t'), 's')
        self.assertEqual(
            strings[int(name.findtext('s:v', namespaces=ns))][0].text, '  =1+1, "Example"'
        )
        self.assertIsNone(cells.find('.//s:f', ns))
        self.assertEqual(gross.get('t', 'n'), 'n')
        self.assertEqual(Decimal(gross.findtext('s:v', namespaces=ns)), Decimal('40.00'))
        self.assertEqual(Decimal(share.findtext('s:v', namespaces=ns)), Decimal('0.4000'))

    def test_export_enforces_admin_mfa_and_valid_scope(self):
        url = reverse('reports:sales-export')
        query = {'group_by': 'sponsor', 'file_format': 'csv'}
        self.client.force_authenticate(self.driver_a.user)
        self.assertEqual(self.client.get(url, query).status_code, 403)
        unenrolled = User.objects.create_user(username='unenrolled.export', is_staff=True)
        self.client.force_authenticate(unenrolled)
        self.assertEqual(self.client.get(url, query).status_code, 403)
        self.authenticate_admin()
        self.assertEqual(self.client.get(url, {**query, 'file_format': 'unknown'}).status_code, 400)
        self.assertEqual(
            self.client.get(url, {**query, 'driver_id': self.driver_a.pk}).status_code, 400
        )

    def test_reports_require_enrolled_administrator(self):
        driver_response = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'sponsor'},
        )
        sponsor_user = User.objects.create_user(username='report.sponsor')
        SponsorAccount.objects.create(user=sponsor_user, company=self.alpha)
        self.client.force_authenticate(sponsor_user)
        sponsor_response = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'sponsor'},
        )
        self.assertEqual(driver_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(sponsor_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sales_by_sponsor_supports_all_or_one_sponsor(self):
        self.authenticate_admin()
        all_response = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'sponsor'},
        )
        one_response = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'sponsor', 'sponsor_id': self.alpha.pk},
        )
        self.assertEqual(all_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row['sponsor']['name'] for row in all_response.data['results']],
            [
                'Alpha Logistics',
                'Beta Transit',
            ],
        )
        self.assertEqual(
            all_response.data['summary'],
            {
                'sale_count': 4,
                'gross_sales_usd': '140.00',
                'project_share_usd': '1.4000',
                'project_share_rate_percent': '1.00',
            },
        )
        self.assertEqual(one_response.data['count'], 1)
        self.assertEqual(one_response.data['summary']['gross_sales_usd'], '40.00')

    def test_sales_by_driver_supports_organization_and_driver_scope(self):
        self.authenticate_admin()
        sponsor_response = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'driver', 'sponsor_id': self.alpha.pk},
        )
        driver_response = self.client.get(
            reverse('reports:sales'),
            {
                'group_by': 'driver',
                'sponsor_id': self.alpha.pk,
                'driver_id': self.driver_a.pk,
            },
        )
        self.assertEqual(
            [row['driver']['username'] for row in sponsor_response.data['results']],
            ['alice.driver', 'bob.driver'],
        )
        self.assertEqual(driver_response.data['summary']['sale_count'], 2)
        self.assertEqual(driver_response.data['summary']['project_share_usd'], '0.3495')

    def test_driver_scope_requires_matching_sponsor_and_driver_group(self):
        self.authenticate_admin()
        no_sponsor = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'driver', 'driver_id': self.driver_a.pk},
        )
        wrong_sponsor = self.client.get(
            reverse('reports:sales'),
            {
                'group_by': 'driver',
                'sponsor_id': self.beta.pk,
                'driver_id': self.driver_a.pk,
            },
        )
        sponsor_group = self.client.get(
            reverse('reports:sales'),
            {
                'group_by': 'sponsor',
                'sponsor_id': self.alpha.pk,
                'driver_id': self.driver_a.pk,
            },
        )
        for response in (no_sponsor, wrong_sponsor, sponsor_group):
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_options_return_all_sponsors_and_only_selected_sponsor_drivers(self):
        self.authenticate_admin()
        response = self.client.get(
            reverse('reports:sales-options'),
            {'sponsor_id': self.alpha.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item['name'] for item in response.data['sponsors']],
            [
                'Alpha Logistics',
                'Beta Transit',
            ],
        )
        self.assertEqual(
            [item['username'] for item in response.data['drivers']],
            [
                'alice.driver',
                'bob.driver',
            ],
        )

    def test_empty_scope_returns_zero_totals_and_no_rows(self):
        empty = SponsorCompany.objects.create(name='Empty Sponsor')
        self.authenticate_admin()
        response = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'sponsor', 'sponsor_id': empty.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['summary']['gross_sales_usd'], '0.00')
        self.assertEqual(response.data['summary']['project_share_usd'], '0.0000')

    def test_transferred_driver_remains_selectable_for_historical_sponsor(self):
        self.driver_a.sponsor = self.beta
        self.driver_a.save()
        self.authenticate_admin()
        options = self.client.get(reverse('reports:sales-options'), {'sponsor_id': self.alpha.pk})
        self.assertIn(self.driver_a.pk, [row['id'] for row in options.data['drivers']])
        response = self.client.get(
            reverse('reports:sales'),
            {
                'group_by': 'driver',
                'sponsor_id': self.alpha.pk,
                'driver_id': self.driver_a.pk,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['gross_sales_usd'], '34.95')

    def test_rejects_unknown_or_malformed_query_parameters(self):
        self.authenticate_admin()
        responses = (
            self.client.get(reverse('reports:sales'), {'group_by': 'company'}),
            self.client.get(reverse('reports:sales'), {'group_by': 'sponsor', 'sponsor_id': 'x'}),
            self.client.get(reverse('reports:sales'), {'group_by': 'sponsor', 'extra': 'x'}),
            self.client.get(reverse('reports:sales-options'), {'extra': 'x'}),
        )
        for response in responses:
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_both_endpoints_require_admin_mfa_enrollment(self):
        unenrolled = User.objects.create_user(username='unenrolled.admin', is_staff=True)
        self.client.force_authenticate(unenrolled)
        for endpoint in ('sales', 'sales-options'):
            with self.subTest(endpoint=endpoint):
                response = self.client.get(
                    reverse(f'reports:{endpoint}'),
                    {'group_by': 'sponsor'} if endpoint == 'sales' else {},
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pagination_preserves_whole_scope_totals(self):
        self.authenticate_admin()
        first = self.client.get(
            reverse('reports:sales'),
            {
                'group_by': 'driver',
                'page_size': 1,
            },
        )
        second = self.client.get(
            reverse('reports:sales'),
            {
                'group_by': 'driver',
                'page_size': 1,
                'page': 2,
            },
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['count'], 3)
        self.assertEqual(len(first.data['results']), 1)
        self.assertNotEqual(first.data['results'], second.data['results'])
        self.assertEqual(first.data['summary'], second.data['summary'])
        self.assertEqual(first.data['summary']['gross_sales_usd'], '140.00')
        self.assertEqual(first.data['summary']['project_share_usd'], '1.4000')
        invalid = self.client.get(
            reverse('reports:sales'),
            {
                'group_by': 'driver',
                'page_size': 1,
                'page': 999,
            },
        )
        self.assertEqual(invalid.status_code, 404)

    def test_one_driver_is_grouped_separately_for_each_sale_sponsor(self):
        self.driver_a.sponsor = self.beta
        self.driver_a.save()
        CompletedSale.objects.create(
            sponsor=self.beta,
            driver=self.driver_a,
            reference='TRANSFER-SALE',
            gross_amount_usd=Decimal('0.01'),
            completed_at=timezone.now(),
        )
        self.authenticate_admin()
        response = self.client.get(reverse('reports:sales'), {'group_by': 'driver'})
        rows = [row for row in response.data['results'] if row['driver']['id'] == self.driver_a.pk]
        self.assertEqual(len(rows), 2)
        self.assertEqual({row['sponsor']['id'] for row in rows}, {self.alpha.pk, self.beta.pk})
        self.assertEqual({row['project_share_usd'] for row in rows}, {'0.3495', '0.0001'})
        options = self.client.get(reverse('reports:sales-options'), {'sponsor_id': self.alpha.pk})
        self.assertEqual([row['id'] for row in options.data['drivers']].count(self.driver_a.pk), 1)
