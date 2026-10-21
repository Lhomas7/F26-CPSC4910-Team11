"""Create disposable demo records without altering existing accounts."""

from datetime import date
from getpass import getpass
import os
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor

from about_page.models import AboutPageRelease
from accounts.models import SponsorAccount, SponsorCompany
from drivers.models import Driver, PointTransaction


ACCOUNTS = (
    ('demo.admin', 'Demo', 'Administrator', 'admin'),
    ('pat.sponsor', 'Pat', 'Sponsor', 'sponsor'),
    ('jamie.rivera', 'Jamie', 'Rivera', 'approved'),
    ('priya.nair', 'Priya', 'Nair', 'pending'),
    ('unlinked.driver', 'Morgan', 'Lee', 'unlinked'),
)
COMPANY = 'Palmetto Freight'


def demo_email(username):
    return 'morgan.lee@example.com' if username == 'unlinked.driver' else f'{username}@example.com'


class Command(BaseCommand):
    help = 'Create local SQLite demo data; preserve existing passwords, MFA, profiles, and history.'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--noinput', action='store_true', help='Read a new-account password from GDIP_DEMO_PASSWORD instead of prompting.')
        parser.add_argument('--with-about', action='store_true', help='Add a separate Local demo About release if absent.')

    def handle(self, *args, **options):
        # Check the engine and environment before any database query or write.
        if connection.vendor != 'sqlite' or not settings.DEBUG:
            raise CommandError('Demo seeding requires SQLite and DJANGO_DEBUG=true. Shared/production environments are refused.')
        name = str(connection.settings_dict['NAME'])
        memory = name == ':memory:' or (name.startswith('file:') and 'mode=memory' in name)
        if not memory and not Path(name).is_file():
            raise CommandError('Local database is missing. Apply migrations before seeding.')
        executor = MigrationExecutor(connection)
        if executor.migration_plan(executor.loader.graph.leaf_nodes()):
            raise CommandError('Apply pending migrations before seeding demo data.')

        User = get_user_model()
        existing = {user.username: user for user in User.objects.filter(
            username__in=[row[0] for row in ACCOUNTS]
        )}
        # Never promote or commandeer an account just because its username matches.
        for username, first, last, role in ACCOUNTS:
            user = existing.get(username)
            if user is None:
                continue
            driver = hasattr(user, 'driver_profile')
            sponsor = hasattr(user, 'sponsor_account')
            correct_role = (
                (role == 'admin' and user.is_staff and not driver and not sponsor)
                or (role == 'sponsor' and sponsor and not driver and not user.is_staff and not user.is_superuser)
                or (role in ('approved', 'pending', 'unlinked') and driver and not sponsor and not user.is_staff and not user.is_superuser)
            )
            if user.email != demo_email(username) or not correct_role:
                raise CommandError(f'Existing account {username} does not match the demo identity. Nothing was seeded.')

        missing = [row for row in ACCOUNTS if row[0] not in existing]
        password = None
        if missing:
            password = os.environ.get('GDIP_DEMO_PASSWORD')
            if not password:
                if options['noinput']:
                    raise CommandError('Set GDIP_DEMO_PASSWORD for new demo accounts or omit --noinput for a private prompt.')
                password = getpass('Password for newly created local demo accounts: ')
                if password != getpass('Confirm local demo password: '):
                    raise CommandError('Passwords do not match. Nothing was seeded.')
            for username, first, last, role in missing:
                try:
                    validate_password(password, User(username=username, first_name=first, last_name=last, email=demo_email(username)))
                except ValidationError:
                    raise CommandError('Demo password does not meet the application password policy. Choose another password; nothing was seeded.') from None

        with transaction.atomic():
            company, _ = SponsorCompany.objects.get_or_create(name=COMPANY)
            users = dict(existing)
            for username, first, last, role in missing:
                user = User.objects.create_user(
                    username=username, email=demo_email(username),
                    first_name=first, last_name=last,
                    password=password, is_staff=role == 'admin',
                )
                users[username] = user
                if role == 'sponsor':
                    SponsorAccount.objects.create(user=user, company=company)
                elif role != 'admin':
                    Driver.objects.create(
                        user=user, name=f'{first} {last}',
                        sponsor=None if role == 'unlinked' else company,
                        status='approved' if role == 'approved' else 'pending',
                    )

            driver = users['jamie.rivera'].driver_profile
            sponsor = users['pat.sponsor']
            if driver.sponsor_id == company.pk and driver.status == 'approved' and sponsor.sponsor_account.company_id == company.pk:
                for amount, reason in (
                    (100, '[Local demo v1] Safe driving award'),
                    (-15, '[Local demo v1] Training correction'),
                ):
                    PointTransaction.objects.get_or_create(
                        driver=driver, sponsor=company, reason=reason,
                        defaults={'point_change': amount, 'changed_by_user': sponsor},
                    )
            else:
                self.stdout.write('Skipped sample points: existing demo membership/status has changed.')

            if options['with_about']:
                AboutPageRelease.objects.get_or_create(
                    version_number='Local demo',
                    defaults={
                        'team_number': 11, 'release_date': date.today(),
                        'product_name': 'Good Driver Incentive Program',
                        'product_description': 'Local demonstration data for account, driver, and points workflows.',
                    },
                )

        self.stdout.write(f'Created {len(missing)} local demo accounts; preserved {len(existing)} existing accounts.')
        for username, first, last, role in ACCOUNTS:
            self.stdout.write(f'  {username}: {role}')
        self.stdout.write('Passwords and MFA enrollment were preserved for existing accounts. Enroll Administrator and Sponsor MFA through the UI.')
