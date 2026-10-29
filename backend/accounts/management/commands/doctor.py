"""Read-only diagnostics for an already loadable Django configuration."""

import os
from pathlib import Path

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from django.db.migrations.loader import MigrationLoader
from dotenv import dotenv_values


class Command(BaseCommand):
    help = 'Report local configuration safely; use --check-database for read-only connectivity and migration checks.'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--check-database', action='store_true')
        parser.add_argument('--database', default='default', choices=tuple(settings.DATABASES))

    def handle(self, *args, **options):
        database = connections[options['database']]
        config = database.settings_dict
        local = config['ENGINE'] == 'django.db.backends.sqlite3'
        failures = []
        self.stdout.write('Backend environment doctor (read-only)')
        self.stdout.write(f'Database alias: {options["database"]}')
        self.stdout.write(
            'Database mode: SQLite (isolated/local)'
            if local
            else 'Database mode: MySQL (potentially shared)'
        )
        self.stdout.write(f'Database name: {config["NAME"]}')
        if not local:
            self.stdout.write(f'Database host: {config.get("HOST") or "not configured"}')
            self.stdout.write(f'Database port: {config.get("PORT") or "default"}')
        self.stdout.write(f'Debug: {settings.DEBUG}')
        self.stdout.write(f'Frontend origin: {settings.FRONTEND_URL}')
        for label, origins in (
            ('CORS', settings.CORS_ALLOWED_ORIGINS),
            ('CSRF', settings.CSRF_TRUSTED_ORIGINS),
        ):
            matched = settings.FRONTEND_URL in origins
            self.stdout.write(f'Frontend allowed by {label}: {matched}')
            if not matched:
                self.stdout.write(
                    f'WARNING: configure the frontend origin in the {label} origin list.'
                )

        console_email = settings.EMAIL_BACKEND == 'django.core.mail.backends.console.EmailBackend'
        self.stdout.write(
            f'Email delivery: {"console" if console_email else "non-console backend"}'
        )
        live_sms = all(
            os.environ.get(key)
            for key in (
                'TWILIO_ACCOUNT_SID',
                'TWILIO_AUTH_TOKEN',
                'TWILIO_FROM_NUMBER',
            )
        )
        self.stdout.write(
            f'SMS delivery: {"Twilio (external)" if live_sms else "console fallback"}'
        )
        if settings.DEBUG and (not console_email or live_sms):
            self.stdout.write('WARNING: local authentication tests may send real email or SMS.')

        for name in ('TOTP_ENCRYPTION_KEY', 'FIELD_ENCRYPTION_KEY'):
            try:
                Fernet(getattr(settings, name, '').encode())
            except (ValueError, TypeError, AttributeError):
                failures.append(f'{name} is missing or is not a valid Fernet key.')
                self.stdout.write(f'{name}: invalid or missing')
            else:
                self.stdout.write(f'{name}: valid format (value hidden)')
        self.stdout.write('Key format checks do not prove existing data can be decrypted.')

        env_path = Path(settings.BASE_DIR) / '.env'
        self.stdout.write(f'backend/.env exists: {env_path.is_file()}')
        if env_path.is_file():
            file_values = dotenv_values(env_path)
            differing = sorted(
                name
                for name, value in file_values.items()
                if value is not None and name in os.environ and os.environ[name] != value
            )
            if differing:
                self.stdout.write('WARNING: effective environment differs from backend/.env for:')
                for name in differing:
                    self.stdout.write(f'  {name} (values hidden)')
                self.stdout.write(
                    'Inherited process variables or runtime secrets may override .env. Check a fresh terminal.'
                )

        if not options['check_database']:
            self.stdout.write(
                'Database connectivity and applied migrations: not checked. Use --check-database.'
            )
        else:
            try:
                name = str(config['NAME'])
                memory_database = name == ':memory:' or (
                    name.startswith('file:') and 'mode=memory' in name
                )
                if local and not memory_database and not Path(name).is_file():
                    raise CommandError(
                        'SQLite database does not exist; diagnostics will not create it.'
                    )
                # Neither the query nor MigrationLoader applies migrations or seeds data.
                with database.cursor() as cursor:
                    cursor.execute('SELECT 1')
                    cursor.fetchone()
                self.stdout.write('Database connectivity: OK')
                loader = MigrationLoader(database)
                loader.check_consistent_history(database)
                conflicts = loader.detect_conflicts()
                if conflicts:
                    failures.append(
                        'Conflicting migration leaves; review showmigrations and the migration audit guide.'
                    )
                pending = [
                    key for key in loader.graph.nodes if key not in loader.applied_migrations
                ]
                self.stdout.write(f'Unapplied migrations: {len(pending)}')
                for app, name in sorted(pending):
                    self.stdout.write(f'  {app}.{name}')
                if pending:
                    self.stdout.write(
                        'Review migrate --plan before applying changes to this database.'
                    )
            except CommandError:
                raise
            except Exception:
                # Driver exceptions can contain credentials or complete connection strings.
                failures.append(
                    'Database or migration inspection failed. Check connectivity, credentials, and migration history privately.'
                )
        if failures:
            raise CommandError(' '.join(failures))
