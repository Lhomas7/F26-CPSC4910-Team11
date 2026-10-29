from unittest import skipUnless

from django.db import connection, connections
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


@skipUnless(connection.vendor == 'sqlite', 'Isolated migration verification uses SQLite.')
class CatalogMigrationTests(TransactionTestCase):
    def test_initial_catalog_migration_preserves_existing_sponsors(self):
        original = connections['default']
        isolated = original.copy(alias='default')
        isolated.settings_dict['NAME'] = ':memory:'
        connections['default'] = isolated
        try:
            # Build the real dependency schema on a separate disposable database;
            # never rewind the test runner's schema or touch a developer database.
            baseline = [('accounts', '0001_initial')]
            executor = MigrationExecutor(connection)
            executor.migrate(baseline)
            apps = executor.loader.project_state(baseline).apps
            sponsor = apps.get_model('accounts', 'SponsorCompany').objects.create(
                name='Existing Sponsor'
            )

            target = [('catalog', '0001_initial')]
            executor = MigrationExecutor(connection)
            executor.migrate(target)
            apps = executor.loader.project_state(target).apps
            Sponsor = apps.get_model('accounts', 'SponsorCompany')
            Product = apps.get_model('catalog', 'CatalogProduct')
            self.assertEqual(Sponsor.objects.get(pk=sponsor.pk).name, 'Existing Sponsor')
            self.assertFalse(Product.objects.exists())
            product = Product.objects.create(
                sponsor_id=sponsor.pk,
                name='Migration Reward',
                price_usd='12.50',
            )
            self.assertTrue(product.is_available)
            self.assertEqual(Product.objects.get(pk=product.pk).sponsor_id, sponsor.pk)
            with connection.cursor() as cursor:
                constraints = connection.introspection.get_constraints(
                    cursor, Product._meta.db_table
                )
            self.assertIn('catalog_product_price_nonnegative', constraints)
            self.assertIn('catalog_product_name_nonempty', constraints)
            self.assertIn('catalog_sponsor_available_idx', constraints)
            self.assertFalse(MigrationExecutor(connection).migration_plan(target))
            # Existing organizations receive the default without changing
            # their identity or the USD prices in their existing catalog.
            target = [('accounts', '0014_sponsor_catalog_rate'), ('catalog', '0001_initial')]
            executor = MigrationExecutor(connection)
            executor.migrate(target)
            apps = executor.loader.project_state(target).apps
            Sponsor = apps.get_model('accounts', 'SponsorCompany')
            Product = apps.get_model('catalog', 'CatalogProduct')
            self.assertEqual(Sponsor.objects.get(pk=sponsor.pk).points_per_dollar, 100)
            self.assertEqual(str(Product.objects.get(pk=product.pk).price_usd), '12.50')
        finally:
            isolated.close()
            connections['default'] = original
