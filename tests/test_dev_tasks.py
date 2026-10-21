"""Fast launcher tests; no dependency installation, network calls, or real database writes."""

import argparse
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import dev


class DevelopmentTaskTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.backend = self.root / 'backend'
        self.backend.mkdir()
        self.config = {
            'backend': self.backend, 'frontend': self.root / 'frontend',
            'venv': self.backend / 'venv', 'requirements': self.backend / 'requirements.txt',
        }

    def options(self, **kwargs):
        return argparse.Namespace(migrate=False, allow_shared_db=False, **kwargs)

    def test_environment_python_is_selected_without_shell_activation(self):
        with patch.object(dev.sys, 'platform', 'win32'):
            self.assertEqual(dev.backend_python(self.config), self.backend / 'venv/Scripts/python.exe')
        with patch.object(dev.sys, 'platform', 'darwin'):
            self.assertEqual(dev.backend_python(self.config), self.backend / 'venv/bin/python')

    def test_missing_database_requires_explicit_migrate_option(self):
        with patch.object(dev, 'manage') as manage:
            with self.assertRaisesRegex(dev.TaskError, 'database is missing'):
                dev.prepare_database(self.config, self.options(), 'sqlite')
        self.assertFalse(any(call.args[1] == 'migrate' for call in manage.call_args_list))

    def test_shared_database_migration_requires_acknowledgment(self):
        options = self.options()
        options.migrate = True
        with patch.object(dev, 'manage') as manage:
            with self.assertRaisesRegex(dev.TaskError, '--allow-shared-db'):
                dev.prepare_database(self.config, options, 'mysql')
        self.assertFalse(any('--noinput' in call.args for call in manage.call_args_list))

    def test_new_local_database_is_explicitly_migrated_then_verified(self):
        options = self.options()
        options.migrate = True
        with patch.object(dev, 'manage') as manage:
            dev.prepare_database(self.config, options, 'sqlite')
        self.assertEqual([call.args[1:] for call in manage.call_args_list], [
            ('doctor',), ('check',), ('migrate', '--noinput'), ('migrate', '--check'),
        ])

    def test_failed_checks_stop_before_migrations(self):
        options = self.options()
        options.migrate = True
        with patch.object(dev, 'manage', side_effect=dev.TaskError('Invalid config')) as manage:
            with self.assertRaises(dev.TaskError):
                dev.prepare_database(self.config, options, 'sqlite')
        self.assertEqual(manage.call_count, 1)

    def test_subprocess_failure_stops_the_task(self):
        with patch.object(dev.subprocess, 'run') as process:
            process.return_value.returncode = 7
            with self.assertRaisesRegex(dev.TaskError, 'exit code 7'):
                dev.run(['example'], self.root)

    def test_old_node_version_is_rejected_before_installation(self):
        with patch.object(dev.shutil, 'which', return_value='node'), patch.object(dev.subprocess, 'run') as process:
            process.return_value.stdout = 'v20.19.0'
            process.return_value.returncode = 0
            with self.assertRaisesRegex(dev.TaskError, 'Node.js 22'):
                dev.check_node()

    def test_preflight_reports_missing_keys_without_django_startup(self):
        with patch.object(dev, 'backend_python', return_value=Path(__file__)), patch.object(dev.subprocess, 'run') as process:
            process.return_value.stdout = '{"engine":"sqlite","errors":["TOTP_ENCRYPTION_KEY must contain a valid Fernet key."]}'
            process.return_value.returncode = 0
            with self.assertRaisesRegex(dev.TaskError, 'TOTP_ENCRYPTION_KEY'):
                dev.preflight(self.config)

    def test_setup_preserves_existing_environment_file(self):
        env_file = self.backend / '.env'
        env_file.write_text('DO_NOT_REPLACE=existing-value\n', encoding='utf-8')
        with (
            patch.object(dev, 'configuration', return_value=self.config),
            patch.object(dev, 'backend_python', return_value=Path(__file__)),
            patch.object(dev, 'preflight', return_value='sqlite'),
            patch.object(dev, 'prepare_database'),
            patch.object(dev, 'run') as run,
            redirect_stdout(StringIO()),
        ):
            result = dev.main(['setup', '--skip-install', '--backend-only'])
        self.assertEqual(result, 0)
        self.assertEqual(env_file.read_text(), 'DO_NOT_REPLACE=existing-value\n')
        run.assert_not_called()

    def test_missing_env_copies_template_then_stops_for_configuration(self):
        (self.backend / '.env.example').write_text('DB_ENGINE=mysql\n', encoding='utf-8')
        with (
            patch.object(dev, 'configuration', return_value=self.config),
            patch.object(dev, 'backend_python', return_value=Path(__file__)),
            patch.object(dev, 'preflight') as preflight,
            redirect_stderr(StringIO()),
        ):
            result = dev.main(['setup', '--skip-install', '--backend-only'])
        self.assertEqual(result, 1)
        self.assertEqual((self.backend / '.env').read_text(), 'DB_ENGINE=mysql\n')
        preflight.assert_not_called()


if __name__ == '__main__':
    unittest.main()
