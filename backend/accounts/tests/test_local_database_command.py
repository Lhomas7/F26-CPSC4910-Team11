from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings


@override_settings(DEBUG=True)
class LocalDatabaseCommandGuardsTests(SimpleTestCase):
    def setUp(self):
        base = Path(__file__).resolve().parents[2]
        self.settings = override_settings(BASE_DIR=base)
        self.settings.enable()
        self.addCleanup(self.settings.disable)
        self.database = SimpleNamespace(
            vendor='sqlite',
            settings_dict={'NAME': str(base / 'db.sqlite3')},
            close=Mock(),
        )
        patcher = patch('accounts.management.commands.local_database.connection', self.database)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_restore_requires_stopped_server_and_target_confirmation(self):
        with patch('accounts.management.commands.local_database.restore_database') as restore:
            for options in (
                {},
                {'server_stopped': True},
                {'server_stopped': True, 'confirm': 'wrong.sqlite3'},
            ):
                with (
                    self.subTest(options=options),
                    self.assertRaisesMessage(CommandError, 'Stop Django'),
                ):
                    call_command(
                        'local_database',
                        'restore',
                        archive='example.sqlite3',
                        stdout=StringIO(),
                        **options,
                    )
            restore.assert_not_called()

    def test_archive_path_cannot_escape_backup_directory(self):
        with self.assertRaisesMessage(CommandError, 'only an archive filename'):
            call_command(
                'local_database', 'restore', archive='../outside.sqlite3', stdout=StringIO()
            )

    def test_shared_database_is_refused(self):
        self.database.vendor = 'mysql'
        with self.assertRaisesMessage(CommandError, 'require SQLite'):
            call_command('local_database', 'backup', stdout=StringIO())

    @override_settings(DEBUG=False)
    def test_non_debug_environment_is_refused(self):
        with self.assertRaisesMessage(CommandError, 'DJANGO_DEBUG=true'):
            call_command('local_database', 'backup', stdout=StringIO())
