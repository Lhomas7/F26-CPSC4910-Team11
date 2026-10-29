import json
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from .models import AboutPageRelease


@override_settings(DEBUG=True)
class SeedAboutPageCommandTests(TestCase):
    def setUp(self):
        # The Sprint 3 data migration seeds a row when the test database is
        # built, so it persists across every test. Clear it here so these
        # tests only see what they create themselves.
        AboutPageRelease.objects.all().delete()

    def test_creates_initial_release(self):
        output = StringIO()

        call_command('seed_about_page', stdout=output)

        release = AboutPageRelease.objects.get(version_number='0.4.0')
        self.assertEqual(release.team_number, 11)
        self.assertEqual(release.product_name, 'Good Driver Incentive Program')
        self.assertEqual(release.release_date.isoformat(), '2026-10-09')
        self.assertEqual(AboutPageRelease.objects.count(), 6)
        self.assertIn('created 6', output.getvalue())

    def test_updates_existing_release_without_duplicating_it(self):
        call_command('seed_about_page', stdout=StringIO())
        release = AboutPageRelease.objects.get(version_number='0.1.0')
        release.product_name = 'Outdated name'
        release.save()
        output = StringIO()

        with self.assertRaisesMessage(CommandError, 'Existing metadata differs'):
            call_command('seed_about_page', stdout=output)
        release.refresh_from_db()
        self.assertEqual(release.product_name, 'Outdated name')
        call_command('seed_about_page', update=True, stdout=output)

        self.assertEqual(AboutPageRelease.objects.count(), 6)
        release.refresh_from_db()
        self.assertEqual(release.product_name, 'Good Driver Incentive Program')
        self.assertIn('updated 1', output.getvalue())

    def test_rerun_preserves_records_and_timestamps(self):
        call_command('seed_about_page', stdout=StringIO())
        before = list(AboutPageRelease.objects.values())
        call_command('seed_about_page', stdout=StringIO())
        self.assertEqual(list(AboutPageRelease.objects.values()), before)

    def test_legacy_release_is_preserved_but_current_canonical_version_is_selected(self):
        legacy = AboutPageRelease.objects.create(
            team_number=11,
            version_number='Sprint 3',
            release_date='2026-09-30',
            product_name='Legacy product',
            product_description='Legacy description',
        )
        call_command('seed_about_page', stdout=StringIO())
        legacy.refresh_from_db()
        self.assertEqual(legacy.product_name, 'Legacy product')
        self.assertEqual(AboutPageRelease.objects.first().version_number, '0.6.0')

    @override_settings(DEBUG=False)
    def test_protected_environment_requires_explicit_acknowledgment(self):
        with self.assertRaisesMessage(CommandError, '--allow-shared-db'):
            call_command('seed_about_page', stdout=StringIO())
        self.assertFalse(AboutPageRelease.objects.exists())
        call_command('seed_about_page', allow_shared_db=True, stdout=StringIO())
        self.assertEqual(AboutPageRelease.objects.count(), 6)

    def test_invalid_metadata_writes_nothing(self):
        valid = dict(
            team_number=11,
            version_number='0.5.0-dev.1',
            release_date='2026-10-20',
            product_name='Good Driver',
            product_description='Development build',
        )
        for changes in (
            {'version_number': '0.4.x'},
            {'version_number': '0.5.0-dev.01'},
            {'team_number': 0},
            {'release_date': '2026-02-30'},
            {'product_name': ''},
            {'product_description': ''},
            {'product_name': 'X' * 101},
        ):
            with self.subTest(changes=changes):
                rows = [valid, {**valid, 'version_number': '0.5.1', **changes}]
                with patch(
                    'about_page.management.commands.seed_about_page.Path.read_text',
                    return_value=json.dumps(rows),
                ):
                    with self.assertRaises(CommandError):
                        call_command('seed_about_page', stdout=StringIO())
                self.assertFalse(AboutPageRelease.objects.exists())

    def test_accepts_concrete_development_version(self):
        rows = [
            dict(
                team_number=11,
                version_number='0.5.0-dev.84',
                release_date='2026-10-20',
                product_name='Good Driver',
                product_description='Development build',
            )
        ]
        with patch(
            'about_page.management.commands.seed_about_page.Path.read_text',
            return_value=json.dumps(rows),
        ):
            call_command('seed_about_page', stdout=StringIO())
        self.assertTrue(AboutPageRelease.objects.filter(version_number='0.5.0-dev.84').exists())
