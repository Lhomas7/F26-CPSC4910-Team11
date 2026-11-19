from unittest import skipUnless

from django.db import connection, connections
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


@skipUnless(connection.vendor == 'sqlite', 'Isolated migration verification uses SQLite.')
class DriverMembershipMigrationTests(TransactionTestCase):
    def test_existing_drivers_keep_their_sponsor_and_status_as_memberships(self):
        original = connections['default']
        isolated = original.copy(alias='default')
        isolated.settings_dict['NAME'] = ':memory:'
        connections['default'] = isolated
        try:
            # Build the single-sponsor schema on a separate disposable database;
            # never rewind the test runner's schema or touch a developer database.
            before = [('drivers', '0010_sponsor_behaviors')]
            executor = MigrationExecutor(connection)
            executor.migrate(before)
            apps = executor.loader.project_state(before).apps
            User = apps.get_model('auth', 'User')
            Sponsor = apps.get_model('accounts', 'SponsorCompany')
            Driver = apps.get_model('drivers', 'Driver')
            sponsor = Sponsor.objects.create(name='Existing Sponsor')
            approved = Driver.objects.create(
                user=User.objects.create(username='approved'),
                name='Approved',
                sponsor=sponsor,
                status='approved',
            )
            pending = Driver.objects.create(
                user=User.objects.create(username='pending'),
                name='Pending',
                sponsor=sponsor,
                status='pending',
            )
            unassigned = Driver.objects.create(
                user=User.objects.create(username='unassigned'), name='Unassigned'
            )

            after = [('drivers', '0013_remove_driver_sponsor_status')]
            executor = MigrationExecutor(connection)
            executor.migrate(after)
            apps = executor.loader.project_state(after).apps
            Membership = apps.get_model('drivers', 'DriverSponsorMembership')
            self.assertEqual(
                set(Membership.objects.values_list('driver_id', 'sponsor_id', 'status')),
                {
                    (approved.pk, sponsor.pk, 'approved'),
                    (pending.pk, sponsor.pk, 'pending'),
                },
            )
            self.assertFalse(Membership.objects.filter(driver_id=unassigned.pk).exists())
            field_names = {
                field.name for field in apps.get_model('drivers', 'Driver')._meta.get_fields()
            }
            self.assertNotIn('sponsor', field_names)
            self.assertNotIn('status', field_names)

            # Rolling back restores the single link from the membership.
            executor = MigrationExecutor(connection)
            executor.migrate(before)
            apps = executor.loader.project_state(before).apps
            Driver = apps.get_model('drivers', 'Driver')
            self.assertEqual(
                set(Driver.objects.values_list('pk', 'sponsor_id', 'status')),
                {
                    (approved.pk, sponsor.pk, 'approved'),
                    (pending.pk, sponsor.pk, 'pending'),
                    (unassigned.pk, None, 'pending'),
                },
            )
        finally:
            isolated.close()
            connections['default'] = original
