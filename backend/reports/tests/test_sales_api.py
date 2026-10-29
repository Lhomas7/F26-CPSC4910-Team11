from decimal import Decimal

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
            username='report.admin', password='ExamplePassword123!',
        )
        enroll_totp(cls.admin)
        cls.alpha = SponsorCompany.objects.create(name='Alpha Logistics')
        cls.beta = SponsorCompany.objects.create(name='Beta Transit')
        cls.driver_a = Driver.objects.create(
            user=User.objects.create_user(username='alice.driver'),
            name='Alice Driver', sponsor=cls.alpha, status='approved',
        )
        cls.driver_b = Driver.objects.create(
            user=User.objects.create_user(username='bob.driver'),
            name='Bob Driver', sponsor=cls.alpha, status='approved',
        )
        cls.driver_c = Driver.objects.create(
            user=User.objects.create_user(username='cora.driver'),
            name='Cora Driver', sponsor=cls.beta, status='approved',
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

    def test_reports_require_enrolled_administrator(self):
        driver_response = self.client.get(
            reverse('reports:sales'), {'group_by': 'sponsor'},
        )
        sponsor_user = User.objects.create_user(username='report.sponsor')
        SponsorAccount.objects.create(user=sponsor_user, company=self.alpha)
        self.client.force_authenticate(sponsor_user)
        sponsor_response = self.client.get(
            reverse('reports:sales'), {'group_by': 'sponsor'},
        )
        self.assertEqual(driver_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(sponsor_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sales_by_sponsor_supports_all_or_one_sponsor(self):
        self.authenticate_admin()
        all_response = self.client.get(
            reverse('reports:sales'), {'group_by': 'sponsor'},
        )
        one_response = self.client.get(
            reverse('reports:sales'),
            {'group_by': 'sponsor', 'sponsor_id': self.alpha.pk},
        )
        self.assertEqual(all_response.status_code, status.HTTP_200_OK)
        self.assertEqual([row['sponsor']['name'] for row in all_response.data['results']], [
            'Alpha Logistics', 'Beta Transit',
        ])
        self.assertEqual(all_response.data['summary'], {
            'sale_count': 4,
            'gross_sales_usd': '140.00',
            'project_share_usd': '1.4000',
            'project_share_rate_percent': '1.00',
        })
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
            reverse('reports:sales-options'), {'sponsor_id': self.alpha.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['name'] for item in response.data['sponsors']], [
            'Alpha Logistics', 'Beta Transit',
        ])
        self.assertEqual([item['username'] for item in response.data['drivers']], [
            'alice.driver', 'bob.driver',
        ])

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
        response = self.client.get(reverse('reports:sales'), {
            'group_by': 'driver', 'sponsor_id': self.alpha.pk, 'driver_id': self.driver_a.pk,
        })
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

