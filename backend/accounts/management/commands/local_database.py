"""Explicit, guarded local SQLite archive commands."""

from pathlib import Path
import sqlite3

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from accounts.services.local_database import backup_database, inspect_database, restore_database


class Command(BaseCommand):
    help = 'Back up, list, inspect, or restore isolated local SQLite databases.'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('action', choices=('backup', 'list', 'inspect', 'restore'))
        parser.add_argument('--archive', help='A backup filename from backend/.local-backups, without directory components.')
        parser.add_argument('--server-stopped', action='store_true')
        parser.add_argument('--confirm', help='For restore, type the target database filename exactly.')

    def handle(self, *args, **options):
        if connection.vendor != 'sqlite' or not settings.DEBUG:
            raise CommandError('Local database archives require SQLite and DJANGO_DEBUG=true.')
        base = Path(settings.BASE_DIR).resolve()
        target = Path(connection.settings_dict['NAME']).resolve()
        directory = (base / '.local-backups').resolve()
        if not target.is_relative_to(base) or target.suffix != '.sqlite3' or not directory.is_relative_to(base):
            raise CommandError('Database and backup directory must remain inside backend; in-memory databases are unsupported.')
        archive = None
        if options['archive']:
            name = options['archive']
            if name != Path(name).name or '/' in name or '\\' in name:
                raise CommandError('Use only an archive filename from the local backup directory.')
            archive = (directory / name).resolve()
            if not archive.is_relative_to(directory) or archive.suffix != '.sqlite3':
                raise CommandError('Invalid archive path.')
        try:
            if options['action'] == 'list':
                for path in sorted(directory.glob('*.sqlite3')):
                    self.stdout.write(path.name)
            elif options['action'] == 'backup':
                path = backup_database(target, directory)
                self.stdout.write(f'Backup created: {path.name}')
            elif options['action'] == 'inspect':
                migrations = inspect_database(archive or target)
                self.stdout.write(f'Integrity: OK; applied migrations: {len(migrations)}')
                for app, name in migrations:
                    self.stdout.write(f'  {app}.{name}')
            else:
                if not archive:
                    raise CommandError('Restore requires --archive with a listed backup filename.')
                if not options['server_stopped'] or options['confirm'] != target.name:
                    raise CommandError(f'Stop Django and all database clients, then supply --server-stopped --confirm {target.name}.')
                connection.close()
                preserved = restore_database(archive, target, directory)
                self.stdout.write(f'Restored: {target.name}')
                if preserved:
                    self.stdout.write(f'Previous database preserved: {preserved.name}')
                self.stdout.write('Keep the matching encryption keys. Review doctor and migrate --plan before restarting.')
        except (OSError, ValueError, sqlite3.Error) as error:
            raise CommandError(f'Local database operation failed: {error}') from None
