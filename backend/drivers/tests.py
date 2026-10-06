from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SponsorAccount, SponsorCompany
from accounts.tests.common import enroll_totp

from .models import Driver, PointTransaction


class PointTransactionModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.sponsor_user = get_user_model().objects.create_user(
            username='points.sponsor',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.driver_user = get_user_model().objects.create_user(
            username='points.driver',
            password='ExamplePassword123!',
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user,
            name='Points Driver',
            sponsor=cls.company,
            status='approved',
        )

    def record(self, amount, reason='Safe driving recognition'):
        return PointTransaction.objects.create(
            driver=self.driver,
            sponsor=self.company,
            changed_by_user=self.sponsor_user,
            point_change=amount,
            reason=reason,
        )

    def test_new_driver_has_zero_point_balance(self):
        self.assertEqual(self.driver.point_balance, 0)

    def test_balance_is_sum_of_signed_transactions(self):
        self.record(100)
        self.record(-25, reason='Documented policy violation')
        self.record(10)

        self.assertEqual(self.driver.point_balance, 85)

    def test_transaction_retains_audit_context(self):
        entry = self.record(25)

        self.assertEqual(entry.driver, self.driver)
        self.assertEqual(entry.sponsor, self.company)
        self.assertEqual(entry.changed_by_user, self.sponsor_user)
        self.assertEqual(entry.reason, 'Safe driving recognition')
        self.assertIsNotNone(entry.changed_at)
        self.assertEqual(str(entry), 'Points Driver: +25 points')

    def test_zero_point_transaction_is_rejected_by_database(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.record(0)

    def test_ledger_protects_driver_and_sponsor_history(self):
        self.record(25)

        with self.assertRaises(ProtectedError):
            self.driver.delete()
        with self.assertRaises(ProtectedError):
            self.company.delete()

    def test_actor_can_be_removed_without_losing_history(self):
        entry = self.record(25)

        self.sponsor_user.delete()
        entry.refresh_from_db()

        self.assertIsNone(entry.changed_by_user)


class DriverViewSetMFAGateTests(APITestCase):
    """The MFAEnrolled permission (accounts/permissions.py) applied to this
    viewset should block sponsors until they enroll, and block a driver only
    when their sponsor company has opted every driver into required MFA.
    """

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Acme Co')
        cls.sponsor_user = get_user_model().objects.create_user(
            username='fleet.sponsor', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.driver_user = get_user_model().objects.create_user(
            username='fleet.driver', password='ExamplePassword123!'
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Fleet Driver', sponsor=cls.company
        )

    def test_sponsor_blocked_from_managing_drivers_until_enrolled(self):
        self.client.force_authenticate(self.sponsor_user)

        before = self.client.get(reverse('driver-list'))
        self.assertEqual(before.status_code, status.HTTP_403_FORBIDDEN)

        enroll_totp(self.sponsor_user)

        after = self.client.get(reverse('driver-list'))
        self.assertEqual(after.status_code, status.HTTP_200_OK)

    def test_driver_only_blocked_when_companys_mfa_is_required(self):
        self.client.force_authenticate(self.driver_user)

        # Not required yet: the driver can see their own record.
        response = self.client.get(reverse('driver-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.company.driver_mfa_required = True
        self.company.save(update_fields=['driver_mfa_required'])

        blocked = self.client.get(reverse('driver-list'))
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

        enroll_totp(self.driver_user)

        allowed = self.client.get(reverse('driver-list'))
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
