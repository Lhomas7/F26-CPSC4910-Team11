from io import StringIO
from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings


class EnvironmentDoctorTests(SimpleTestCase):
    def setUp(self):
        self.output = StringIO()
        self.database = MagicMock()
        self.database.settings_dict = {
            'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:',
        }
        module = 'accounts.management.commands.doctor'
        self.connections = patch(f'{module}.connections', {'default': self.database})
        self.connections.start()
        self.addCleanup(self.connections.stop)
        self.file = patch(f'{module}.Path.is_file', return_value=False)
        self.file.start()
        self.addCleanup(self.file.stop)
        self.settings = override_settings(
            TOTP_ENCRYPTION_KEY=Fernet.generate_key().decode(),
            FIELD_ENCRYPTION_KEY=Fernet.generate_key().decode(),
        )
        self.settings.enable()
        self.addCleanup(self.settings.disable)

    def test_default_report_does_not_connect_or_expose_keys(self):
        call_command('doctor', stdout=self.output)

        self.database.cursor.assert_not_called()
        self.assertIn('not checked', self.output.getvalue())
        from django.conf import settings
        self.assertNotIn(settings.TOTP_ENCRYPTION_KEY, self.output.getvalue())
        self.assertNotIn(settings.FIELD_ENCRYPTION_KEY, self.output.getvalue())

    @patch('accounts.management.commands.doctor.MigrationLoader')
    def test_database_check_only_queries_and_reports_pending_migrations(self, loader):
        loader.return_value.detect_conflicts.return_value = {}
        loader.return_value.graph.nodes = {('accounts', 'pending_example'): object()}
        loader.return_value.applied_migrations = {}

        call_command('doctor', check_database=True, stdout=self.output)

        cursor = self.database.cursor.return_value.__enter__.return_value
        cursor.execute.assert_called_once_with('SELECT 1')
        self.assertIn('accounts.pending_example', self.output.getvalue())
        loader.return_value.check_consistent_history.assert_called_once_with(self.database)

    def test_database_errors_do_not_echo_driver_secrets(self):
        self.database.cursor.side_effect = RuntimeError('password=DO-NOT-PRINT')

        with self.assertRaises(CommandError) as error:
            call_command('doctor', check_database=True, stdout=self.output)

        self.assertNotIn('DO-NOT-PRINT', str(error.exception) + self.output.getvalue())

    def test_missing_sqlite_file_is_not_created(self):
        self.database.settings_dict['NAME'] = 'missing.sqlite3'

        with self.assertRaisesMessage(CommandError, 'will not create it'):
            call_command('doctor', check_database=True, stdout=self.output)

        self.database.cursor.assert_not_called()

    @override_settings(FIELD_ENCRYPTION_KEY='invalid-key')
    def test_invalid_encryption_key_fails_without_printing_value(self):
        with self.assertRaises(CommandError):
            call_command('doctor', stdout=self.output)
        self.assertNotIn('invalid-key', self.output.getvalue())

    @patch('accounts.management.commands.doctor.dotenv_values', return_value={'DB_PASSWORD': 'file-secret'})
    @patch.dict('os.environ', {'DB_PASSWORD': 'process-secret'})
    def test_env_override_report_names_the_variable_without_its_values(self, dotenv):
        self.file.stop()
        with patch('accounts.management.commands.doctor.Path.is_file', return_value=True):
            call_command('doctor', stdout=self.output)

        report = self.output.getvalue()
        self.assertIn('DB_PASSWORD (values hidden)', report)
        self.assertNotIn('file-secret', report)
        self.assertNotIn('process-secret', report)
