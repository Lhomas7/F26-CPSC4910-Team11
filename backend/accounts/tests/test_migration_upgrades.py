"""Exercise real historical upgrades using only Django's disposable test database."""

from unittest import skipUnless

from django.db import connection, connections
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from ..fields import CIPHERTEXT_PREFIX


@skipUnless(connection.vendor == 'sqlite', 'These isolated historical upgrade checks use SQLite.')
class Sprint5MigrationUpgradeTests(TransactionTestCase):
    def upgrade_from(self, branch):
        original = connections['default']
        isolated = original.copy(alias='default')
        isolated.settings_dict['NAME'] = ':memory:'
        connections['default'] = isolated
        latest = MigrationExecutor(connection).loader.graph.leaf_nodes()
        baseline = [('accounts', '0009_accountprofile'), ('drivers', '0008_driver_phone_number')]
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(baseline)
            apps = executor.loader.project_state(baseline).apps
            user = apps.get_model('auth', 'User').objects.create(username='migration.driver')
            driver = apps.get_model('drivers', 'Driver').objects.create(
                user_id=user.pk, name='Migration Driver', phone_number='+18645550111',
            )
            mfa = apps.get_model('accounts', 'MFASettings').objects.create(
                user_id=user.pk, phone_number='+18645550222',
            )

            executor = MigrationExecutor(connection)
            executor.migrate([('accounts', branch)])
            if branch == '0011_driver_notification_preferences':
                # This deployed path already has a plaintext pending-number column.
                MFA = executor.loader.project_state([('accounts', branch)]).apps.get_model(
                    'accounts', 'MFASettings'
                )
                MFA.objects.filter(pk=mfa.pk).update(pending_phone_number='+18645550333')

            executor = MigrationExecutor(connection)
            executor.migrate(latest)
            apps = executor.loader.project_state(latest).apps
            upgraded = apps.get_model('accounts', 'MFASettings').objects.get(pk=mfa.pk)
            self.assertEqual(upgraded.phone_number, '+18645550222')
            self.assertEqual(
                apps.get_model('drivers', 'Driver').objects.get(pk=driver.pk).phone_number,
                '+18645550111',
            )
            expected_pending = '+18645550333' if branch == '0011_driver_notification_preferences' else None
            self.assertEqual(upgraded.pending_phone_number, expected_pending)
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT phone_number, pending_phone_number FROM accounts_mfasettings WHERE id = %s',
                    [mfa.pk],
                )
                verified, pending = cursor.fetchone()
                self.assertTrue(verified.startswith(CIPHERTEXT_PREFIX))
                if expected_pending:
                    self.assertTrue(pending.startswith(CIPHERTEXT_PREFIX))
                cursor.execute('SELECT phone_number FROM drivers_driver WHERE id = %s', [driver.pk])
                self.assertTrue(cursor.fetchone()[0].startswith(CIPHERTEXT_PREFIX))
            self.assertFalse(MigrationExecutor(connection).migration_plan(latest))
        finally:
            # Discard only this isolated database; never rewind the normal test schema.
            isolated.close()
            connections['default'] = original

    def test_upgrade_from_notification_branch_preserves_and_encrypts_phone_data(self):
        self.upgrade_from('0011_driver_notification_preferences')

    def test_upgrade_from_security_branch_preserves_and_encrypts_phone_data(self):
        self.upgrade_from('0011_encrypt_mfa_phone_number')
