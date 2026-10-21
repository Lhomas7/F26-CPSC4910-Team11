from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from about_page.models import AboutPageRelease
from drivers.models import Driver, PointTransaction

from ..models import MFASettings, SponsorCompany


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class LocalDemoSeedTests(TestCase):
    password = 'LocalDemoPassword123!'

    def seed(self, **options):
        output = StringIO()
        with patch.dict('os.environ', {'GDIP_DEMO_PASSWORD': self.password}):
            call_command('seed_local_demo', noinput=True, stdout=output, **options)
        self.assertNotIn(self.password, output.getvalue())
        return output.getvalue()

    def test_creates_role_states_and_point_history_without_bypassing_mfa(self):
        self.seed()

        self.assertEqual(get_user_model().objects.count(), 5)
        self.assertEqual(Driver.objects.count(), 3)
        self.assertEqual(Driver.objects.get(user__username='jamie.rivera').point_balance, 85)
        self.assertEqual(Driver.objects.get(user__username='priya.nair').status, 'pending')
        self.assertIsNone(Driver.objects.get(user__username='unlinked.driver').sponsor_id)
        self.assertFalse(MFASettings.objects.exists())
        self.assertTrue(get_user_model().objects.get(username='demo.admin').is_staff)

    def test_rerun_preserves_password_profile_mfa_and_history(self):
        self.seed()
        user = get_user_model().objects.get(username='demo.admin')
        user.set_password('ChangedPassword456!')
        user.first_name = 'Edited'
        user.save()
        MFASettings.objects.create(user=user, totp_enabled=True)
        driver = Driver.objects.get(user__username='jamie.rivera')
        driver.name = 'Edited Driver'
        driver.save()

        self.seed()

        user.refresh_from_db()
        driver.refresh_from_db()
        self.assertTrue(user.check_password('ChangedPassword456!'))
        self.assertEqual(user.first_name, 'Edited')
        self.assertTrue(user.mfa_settings.totp_enabled)
        self.assertEqual(driver.name, 'Edited Driver')
        self.assertEqual(PointTransaction.objects.count(), 2)

    def test_partial_existing_demo_account_is_preserved(self):
        user = get_user_model().objects.create_user(
            username='pat.sponsor', email='pat.sponsor@example.com', password=self.password,
        )
        company = SponsorCompany.objects.create(name='Other Demo Organization')
        from ..models import SponsorAccount
        SponsorAccount.objects.create(user=user, company=company)

        output = self.seed()

        self.assertEqual(user.sponsor_account.company, company)
        self.assertEqual(get_user_model().objects.count(), 5)
        self.assertFalse(PointTransaction.objects.exists())
        self.assertIn('Skipped sample points', output)

    def test_username_collision_refuses_before_creating_demo_records(self):
        get_user_model().objects.create_user(username='demo.admin', email='real@example.com')

        with self.assertRaisesMessage(CommandError, 'does not match the demo identity'):
            self.seed()

        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertFalse(SponsorCompany.objects.exists())

    @override_settings(DEBUG=False)
    def test_non_debug_environment_is_refused_without_database_queries(self):
        with self.assertNumQueries(0), self.assertRaises(CommandError):
            self.seed()

    def test_mysql_is_refused_without_database_queries(self):
        with patch('accounts.management.commands.seed_local_demo.connection.vendor', 'mysql'):
            with self.assertNumQueries(0), self.assertRaises(CommandError):
                self.seed()

    def test_about_records_only_change_when_explicitly_requested(self):
        before = list(AboutPageRelease.objects.values())

        self.seed()
        self.assertEqual(list(AboutPageRelease.objects.values()), before)
        self.seed(with_about=True)
        self.seed(with_about=True)

        self.assertEqual(AboutPageRelease.objects.filter(version_number='Local demo').count(), 1)
        self.assertEqual(AboutPageRelease.objects.exclude(version_number='Local demo').count(), len(before))

    def test_missing_noninteractive_password_stops_without_creating_records(self):
        with patch.dict('os.environ', {'GDIP_DEMO_PASSWORD': ''}):
            with self.assertRaisesMessage(CommandError, 'Set GDIP_DEMO_PASSWORD'):
                call_command('seed_local_demo', noinput=True, stdout=StringIO())
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(SponsorCompany.objects.exists())
