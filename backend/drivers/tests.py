from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SponsorAccount, SponsorCompany
from accounts.tests.common import enroll_totp

from .models import Driver, DriverStatusChange, PointTransaction
from .services import MAX_POINT_ADJUSTMENT, PointAdjustmentError, adjust_driver_points


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


class PointAdjustmentServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other_company = SponsorCompany.objects.create(name='Blue Ridge Logistics')
        cls.sponsor_user = get_user_model().objects.create_user(
            username='adjust.sponsor',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.other_sponsor_user = get_user_model().objects.create_user(
            username='other.sponsor',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(
            user=cls.other_sponsor_user,
            company=cls.other_company,
        )
        cls.driver_user = get_user_model().objects.create_user(
            username='adjust.driver',
            password='ExamplePassword123!',
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user,
            name='Adjustment Driver',
            sponsor=cls.company,
            status='approved',
        )
        cls.unassigned_user = get_user_model().objects.create_user(
            username='unassigned.driver',
            password='ExamplePassword123!',
        )
        cls.unassigned_driver = Driver.objects.create(
            user=cls.unassigned_user,
            name='Unassigned Driver',
            status='approved',
        )

    def adjust(self, amount=100, reason='Consistent safe driving', **overrides):
        values = {
            'driver': self.driver,
            'changed_by_user': self.sponsor_user,
            'point_change': amount,
            'reason': reason,
        }
        values.update(overrides)
        return adjust_driver_points(**values)

    def assert_adjustment_error(self, code, **kwargs):
        with self.assertRaises(PointAdjustmentError) as caught:
            self.adjust(**kwargs)
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_award_creates_audited_transaction_and_returns_balance(self):
        result = self.adjust(100, '  Excellent   quarterly performance  ')

        self.assertEqual(result.balance, 100)
        self.assertEqual(result.transaction.point_change, 100)
        self.assertEqual(result.transaction.reason, 'Excellent quarterly performance')
        self.assertEqual(result.transaction.sponsor, self.company)
        self.assertEqual(result.transaction.changed_by_user, self.sponsor_user)

    def test_deduction_updates_balance_without_allowing_it_below_zero(self):
        self.adjust(100)

        result = self.adjust(-40, 'Documented safety violation')

        self.assertEqual(result.balance, 60)
        self.assertEqual(self.driver.point_balance, 60)
        self.assert_adjustment_error(
            'insufficient_points',
            amount=-61,
            reason='Another documented violation',
        )
        self.assertEqual(self.driver.point_balance, 60)

    def test_rejects_zero_noninteger_boolean_and_excessive_amounts(self):
        for amount, code in (
            (0, 'zero_amount'),
            ('10', 'invalid_amount'),
            (True, 'invalid_amount'),
            (MAX_POINT_ADJUSTMENT + 1, 'amount_too_large'),
            (-(MAX_POINT_ADJUSTMENT + 1), 'amount_too_large'),
        ):
            with self.subTest(amount=amount):
                self.assert_adjustment_error(code, amount=amount)

        self.assertFalse(PointTransaction.objects.exists())

    def test_requires_a_nonblank_reason(self):
        for reason in (None, '', ' \n\t '):
            with self.subTest(reason=reason):
                error = self.assert_adjustment_error(
                    'missing_reason',
                    reason=reason,
                )
                self.assertEqual(error.field, 'reason')

    def test_rejects_oversized_and_control_character_reasons(self):
        self.assert_adjustment_error('reason_too_long', reason='a' * 501)
        self.assert_adjustment_error('invalid_reason', reason='unsafe\x00reason')

    def test_rejects_sponsor_from_another_company(self):
        self.assert_adjustment_error(
            'driver_outside_company',
            changed_by_user=self.other_sponsor_user,
        )
        self.assertFalse(PointTransaction.objects.exists())

    def test_rejects_non_sponsor_and_inactive_sponsor_accounts(self):
        self.assert_adjustment_error(
            'not_sponsor',
            changed_by_user=self.driver_user,
        )
        self.sponsor_user.is_active = False
        self.sponsor_user.save(update_fields=['is_active'])
        self.assert_adjustment_error('not_sponsor')

    def test_rejects_unassigned_and_unknown_drivers(self):
        self.assert_adjustment_error(
            'driver_outside_company',
            driver=self.unassigned_driver,
        )
        self.assert_adjustment_error('driver_not_found', driver=999_999)


class PointAdjustmentAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='API Freight')
        cls.other_company = SponsorCompany.objects.create(name='Other Freight')
        cls.sponsor_user = get_user_model().objects.create_user(
            username='api.sponsor',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        enroll_totp(cls.sponsor_user)
        cls.unenrolled_sponsor = get_user_model().objects.create_user(
            username='unenrolled.sponsor',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(
            user=cls.unenrolled_sponsor,
            company=cls.company,
        )
        cls.driver_user = get_user_model().objects.create_user(
            username='api.driver',
            password='ExamplePassword123!',
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user,
            name='API Driver',
            sponsor=cls.company,
            status='approved',
        )
        cls.other_driver_user = get_user_model().objects.create_user(
            username='outside.driver',
            password='ExamplePassword123!',
        )
        cls.other_driver = Driver.objects.create(
            user=cls.other_driver_user,
            name='Outside Driver',
            sponsor=cls.other_company,
            status='approved',
        )

    def points_url(self, driver=None):
        return reverse('driver-points', kwargs={'pk': (driver or self.driver).pk})

    def post(self, data, user=None, driver=None):
        self.client.force_authenticate(user or self.sponsor_user)
        return self.client.post(self.points_url(driver), data, format='json')

    def test_sponsor_can_award_and_deduct_points(self):
        award = self.post({'point_change': 100, 'reason': 'Excellent safety record'})
        deduction = self.post({'point_change': -25, 'reason': 'Documented violation'})

        self.assertEqual(award.status_code, status.HTTP_201_CREATED)
        self.assertEqual(award.data['balance'], 100)
        self.assertEqual(award.data['transaction']['point_change'], 100)
        self.assertEqual(award.data['transaction']['changed_by_user'], self.sponsor_user.id)
        self.assertEqual(deduction.status_code, status.HTTP_201_CREATED)
        self.assertEqual(deduction.data['balance'], 75)
        self.assertEqual(PointTransaction.objects.count(), 2)

    def test_rejects_missing_blank_and_oversized_reasons(self):
        for data in (
            {'point_change': 10},
            {'point_change': 10, 'reason': '   '},
            {'point_change': 10, 'reason': 'a' * 501},
        ):
            with self.subTest(data=data):
                response = self.post(data)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('reason', response.data)

    def test_rejects_invalid_and_excessive_adjustments(self):
        for value in (0, 1_000_001, -1):
            with self.subTest(value=value):
                response = self.post({
                    'point_change': value,
                    'reason': 'Adjustment reason',
                })
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('point_change', response.data)

    def test_other_company_driver_is_not_visible_to_sponsor(self):
        response = self.post(
            {'point_change': 10, 'reason': 'Should not be allowed'},
            driver=self.other_driver,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(PointTransaction.objects.exists())

    def test_driver_and_anonymous_user_cannot_adjust_points(self):
        driver_response = self.post(
            {'point_change': 10, 'reason': 'Not authorized'},
            user=self.driver_user,
        )
        self.client.force_authenticate(user=None)
        anonymous_response = self.client.post(
            self.points_url(),
            {'point_change': 10, 'reason': 'Not authorized'},
            format='json',
        )

        self.assertEqual(driver_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(anonymous_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(PointTransaction.objects.exists())

    def test_sponsor_must_enroll_mfa_before_adjusting_points(self):
        response = self.post(
            {'point_change': 10, 'reason': 'Not enrolled'},
            user=self.unenrolled_sponsor,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(PointTransaction.objects.exists())

    def test_driver_api_exposes_calculated_balance(self):
        PointTransaction.objects.create(
            driver=self.driver,
            sponsor=self.company,
            changed_by_user=self.sponsor_user,
            point_change=80,
            reason='Initial award',
        )
        PointTransaction.objects.create(
            driver=self.driver,
            sponsor=self.company,
            changed_by_user=self.sponsor_user,
            point_change=-15,
            reason='Adjustment',
        )
        self.client.force_authenticate(self.driver_user)

        response = self.client.get(reverse('driver-detail', kwargs={'pk': self.driver.pk}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['point_balance'], 65)


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


class RoleScopedDriverTestData(APITestCase):
    """Two companies, one sponsor each, an admin, and drivers in each state."""

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Scope Freight')
        cls.other_company = SponsorCompany.objects.create(name='Elsewhere Freight')
        cls.admin_user = get_user_model().objects.create_user(
            username='scope.admin',
            password='ExamplePassword123!',
            is_staff=True,
        )
        enroll_totp(cls.admin_user)
        cls.sponsor_user = get_user_model().objects.create_user(
            username='scope.sponsor',
            password='ExamplePassword123!',
            first_name='Pat',
            last_name='Sponsor',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        enroll_totp(cls.sponsor_user)
        cls.other_sponsor_user = get_user_model().objects.create_user(
            username='elsewhere.sponsor',
            password='ExamplePassword123!',
        )
        SponsorAccount.objects.create(user=cls.other_sponsor_user, company=cls.other_company)
        enroll_totp(cls.other_sponsor_user)

        def make_driver(username, name, company, status_value):
            user = get_user_model().objects.create_user(username=username, password='ExamplePassword123!')
            return Driver.objects.create(user=user, name=name, sponsor=company, status=status_value)

        cls.approved = make_driver('scope.approved', 'Avery Approved', cls.company, 'approved')
        cls.pending = make_driver('scope.pending', 'Blake Pending', cls.company, 'pending')
        cls.outsider = make_driver('scope.outsider', 'Casey Outsider', cls.other_company, 'approved')
        for driver, company, change, reason in (
            (cls.approved, cls.company, 50, 'Clean inspection'),
            (cls.approved, cls.company, -10, 'Late log'),
            (cls.outsider, cls.other_company, 30, 'Other company award'),
        ):
            PointTransaction.objects.create(
                driver=driver,
                sponsor=company,
                changed_by_user=cls.sponsor_user if company == cls.company else cls.other_sponsor_user,
                point_change=change,
                reason=reason,
            )


class AdminDriverApiTests(RoleScopedDriverTestData):
    def test_admins_get_no_drivers_and_cannot_change_them(self):
        self.client.force_authenticate(self.admin_user)

        self.assertEqual(self.client.get(reverse('driver-list')).data, [])
        detail_url = reverse('driver-detail', kwargs={'pk': self.approved.pk})
        self.assertEqual(self.client.get(detail_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.patch(detail_url, {'status': 'pending'}, format='json').status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_driver_list_includes_sponsor_name(self):
        self.client.force_authenticate(self.sponsor_user)

        names = {row['name']: row['sponsor_name'] for row in self.client.get(reverse('driver-list')).data}

        self.assertEqual(names, {'Avery Approved': 'Scope Freight', 'Blake Pending': 'Scope Freight'})


class DriverRemovalTests(RoleScopedDriverTestData):
    def remove(self, driver, data, user=None):
        self.client.force_authenticate(user or self.sponsor_user)
        return self.client.post(reverse('driver-remove', kwargs={'pk': driver.pk}), data, format='json')

    def test_rejecting_a_pending_driver_unlinks_them_with_an_audited_reason(self):
        response = self.remove(self.pending, {'reason': '  Missing   CDL details '})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['action'], 'rejected')
        self.pending.refresh_from_db()
        self.assertIsNone(self.pending.sponsor)
        record = DriverStatusChange.objects.get(driver=self.pending)
        self.assertEqual(record.reason, 'Missing CDL details')
        self.assertEqual(record.sponsor, self.company)
        self.assertEqual(record.changed_by_user, self.sponsor_user)

    def test_dropping_an_approved_driver_keeps_their_point_history(self):
        response = self.remove(self.approved, {'reason': 'Left the company'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['action'], 'dropped')
        self.approved.refresh_from_db()
        self.assertIsNone(self.approved.sponsor)
        self.assertEqual(self.approved.status, 'pending')
        self.assertEqual(self.approved.point_balance, 40)
        self.assertEqual(self.approved.point_transactions.count(), 2)

    def test_a_reason_is_required_and_nothing_changes_without_one(self):
        for data in ({}, {'reason': '   '}, {'reason': 'a' * 501}, {'reason': 'bad\x00reason'}):
            with self.subTest(data=data):
                response = self.remove(self.pending, data)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('reason', response.data)
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.sponsor, self.company)
        self.assertFalse(DriverStatusChange.objects.exists())

    def test_only_the_drivers_own_sponsor_can_remove_them(self):
        self.assertEqual(
            self.remove(self.pending, {'reason': 'Not ours'}, user=self.other_sponsor_user).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.remove(self.pending, {'reason': 'Admin attempt'}, user=self.admin_user).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.remove(self.pending, {'reason': 'Self'}, user=self.pending.user).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.sponsor, self.company)


class PointHistoryApiTests(RoleScopedDriverTestData):
    def history(self, user, **params):
        self.client.force_authenticate(user)
        return self.client.get(reverse('point-history'), params)

    def test_drivers_see_only_their_own_history_with_reasons(self):
        response = self.history(self.approved.user)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row['reason'] for row in response.data], ['Late log', 'Clean inspection'])
        self.assertEqual(response.data[0]['point_change'], -10)
        self.assertEqual(response.data[0]['changed_by_name'], 'Pat Sponsor')
        self.assertEqual(response.data[0]['sponsor_name'], 'Scope Freight')

    def test_sponsors_see_their_organizations_changes_and_can_filter_by_driver(self):
        everything = self.history(self.sponsor_user)
        self.assertEqual({row['driver_name'] for row in everything.data}, {'Avery Approved'})
        self.assertEqual(len(everything.data), 2)

        latest = self.history(self.sponsor_user, limit=1)
        self.assertEqual([row['reason'] for row in latest.data], ['Late log'])

        other_driver = self.history(self.sponsor_user, driver=self.outsider.pk)
        self.assertEqual(other_driver.data, [])
        self.assertEqual(self.history(self.sponsor_user, driver='abc').data, [])

    def test_admins_have_no_point_history(self):
        self.assertEqual(self.history(self.admin_user).status_code, status.HTTP_403_FORBIDDEN)
