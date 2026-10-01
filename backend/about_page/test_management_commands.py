from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from .models import AboutPageRelease


class SeedAboutPageCommandTests(TestCase):
    def setUp(self):
        # The Sprint 3 data migration seeds a row when the test database is
        # built, so it persists across every test. Clear it here so these
        # tests only see what they create themselves.
        AboutPageRelease.objects.all().delete()

    def test_creates_initial_release(self):
        output = StringIO()

        call_command('seed_about_page', stdout=output)

        release = AboutPageRelease.objects.get(version_number='Sprint 1')
        self.assertEqual(release.team_number, 11)
        self.assertEqual(release.product_name, 'Good Driver Incentive Program')
        self.assertIn('Created About-page release: Sprint 1', output.getvalue())

    def test_updates_existing_release_without_duplicating_it(self):
        call_command('seed_about_page', stdout=StringIO())
        release = AboutPageRelease.objects.get(version_number='Sprint 1')
        release.product_name = 'Outdated name'
        release.save()
        output = StringIO()

        call_command('seed_about_page', stdout=output)

        self.assertEqual(AboutPageRelease.objects.count(), 1)
        release.refresh_from_db()
        self.assertEqual(release.product_name, 'Good Driver Incentive Program')
        self.assertIn('Updated About-page release: Sprint 1', output.getvalue())
