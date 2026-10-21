"""Contracts required on SQLite and the deployment database engine."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone

from drivers.models import Driver, PointTransaction
from drivers.services import PointAdjustmentError, adjust_driver_points

from ..models import SponsorAccount, SponsorCompany
from ..serializers.registration import RegistrationSerializer


class DatabaseContractTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Compatibility Freight')
        cls.sponsor = User.objects.create_user(username='compat.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        user = User.objects.create_user(username='compat.driver', email='Known.Driver@example.com')
        cls.driver = Driver.objects.create(
            user=user, name='Compatibility Driver', sponsor=cls.company, status='approved',
        )

    def entry(self, change, reason='Compatibility entry'):
        return PointTransaction.objects.create(
            driver=self.driver, sponsor=self.company, changed_by_user=self.sponsor,
            point_change=change, reason=reason,
        )

    def test_zero_point_constraint_is_enforced_in_database(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.entry(0)

    def test_points_rollback_does_not_change_balance_or_send_notification(self):
        self.entry(100)
        with patch('drivers.services.points.notify_point_change') as notify:
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaises(RuntimeError), transaction.atomic():
                    adjust_driver_points(
                        driver=self.driver, changed_by_user=self.sponsor,
                        point_change=-25, reason='Rolled back adjustment',
                    )
                    raise RuntimeError('Rollback this operation')
            notify.assert_not_called()
        self.assertEqual(self.driver.point_balance, 100)
        self.assertEqual(PointTransaction.objects.count(), 1)

    def test_timestamp_ties_use_primary_key_for_stable_history_order(self):
        first = self.entry(10)
        second = self.entry(-2)
        timestamp = timezone.now() - timedelta(days=1)
        PointTransaction.objects.filter(pk__in=[first.pk, second.pk]).update(changed_at=timestamp)
        rows = list(self.driver.point_transactions.all())
        self.assertEqual([row.pk for row in rows], [second.pk, first.pk])
        self.assertTrue(timezone.is_aware(rows[0].changed_at))

    def test_registration_rejects_case_variant_identity_values(self):
        serializer = RegistrationSerializer()
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            serializer.validate_username('COMPAT.DRIVER')
        with self.assertRaises(ValidationError):
            serializer.validate_email('known.driver@EXAMPLE.COM')

    def test_ledger_indexes_exist_on_current_engine(self):
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, PointTransaction._meta.db_table)
        self.assertEqual(constraints['point_tx_driver_time_idx']['columns'], ['driver_id', 'changed_at'])
        self.assertEqual(constraints['point_tx_sponsor_time_idx']['columns'], ['sponsor_id', 'changed_at'])


class ConcurrentPointDeductionTests(TransactionTestCase):
    @skipUnlessDBFeature('has_select_for_update')
    def test_two_deductions_cannot_spend_the_same_balance(self):
        User = get_user_model()
        company = SponsorCompany.objects.create(name='Concurrent Freight')
        sponsor = User.objects.create_user(username='concurrent.sponsor')
        SponsorAccount.objects.create(user=sponsor, company=company)
        user = User.objects.create_user(username='concurrent.driver')
        driver = Driver.objects.create(user=user, name='Concurrent Driver', sponsor=company, status='approved')
        PointTransaction.objects.create(driver=driver, sponsor=company, changed_by_user=sponsor, point_change=100, reason='Initial balance')
        barrier = Barrier(2)

        def deduct():
            close_old_connections()
            try:
                # Bound failures so a lock regression cannot stall CI indefinitely.
                if connection.vendor == 'mysql':
                    with connection.cursor() as cursor:
                        cursor.execute('SET SESSION innodb_lock_wait_timeout = 5')
                actor = User.objects.get(pk=sponsor.pk)
                barrier.wait(timeout=10)
                try:
                    adjust_driver_points(driver=driver.pk, changed_by_user=actor,
                                         point_change=-75, reason='Concurrent deduction')
                    return 'accepted'
                except PointAdjustmentError as error:
                    return error.code
            finally:
                connection.close()

        with patch('drivers.services.points.notify_point_change'), ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(deduct) for _ in range(2)]
            outcomes = [future.result(timeout=20) for future in futures]
        self.assertCountEqual(outcomes, ['accepted', 'insufficient_points'])
        self.assertEqual(driver.point_balance, 25)
        self.assertEqual(driver.point_transactions.count(), 2)
