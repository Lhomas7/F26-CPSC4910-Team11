from datetime import date
import json
from pathlib import Path
import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from about_page.models import AboutPageRelease


FIELDS = {'team_number', 'version_number', 'release_date', 'product_name', 'product_description'}
VERSION = re.compile(
    r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)'
    r'(?:-(?P<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?'
    r'(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?', re.ASCII,
)


class Command(BaseCommand):
    help = 'Import reviewed About metadata; changing existing releases requires --update.'

    def add_arguments(self, parser):
        parser.add_argument('--file', type=Path, default=Path(__file__).resolve().parents[2] / 'release_metadata.json')
        parser.add_argument('--update', action='store_true')
        parser.add_argument('--allow-shared-db', action='store_true')

    def handle(self, *args, **options):
        if (connection.vendor != 'sqlite' or not settings.DEBUG) and not options['allow_shared_db']:
            raise CommandError('Shared/non-debug imports require --allow-shared-db after reviewing the target.')
        try:
            rows = json.loads(options['file'].read_text(encoding='utf-8'))
        except (OSError, ValueError):
            raise CommandError('Could not read the release metadata JSON file.') from None
        if not isinstance(rows, list) or not rows:
            raise CommandError('Release metadata must be a nonempty JSON array.')
        validated, versions = [], set()
        for index, row in enumerate(rows, start=1):
            if not isinstance(row, dict) or set(row) != FIELDS:
                raise CommandError(f'Release entry {index} needs exactly: {", ".join(sorted(FIELDS))}.')
            row = dict(row)
            version = row['version_number']
            match = VERSION.fullmatch(version) if isinstance(version, str) else None
            if not match or any(
                part.isdigit() and len(part) > 1 and part.startswith('0')
                for part in (match.group('prerelease') or '').split('.')
            ):
                raise CommandError(f'Release entry {index} needs an exact semantic version without a v prefix.')
            if version in versions:
                raise CommandError('Duplicate version in metadata.')
            versions.add(version)
            if type(row['team_number']) is not int or not 1 <= row['team_number'] <= 32767:
                raise CommandError(f'Release entry {index} needs a Team number between 1 and 32767.')
            try:
                if not isinstance(row['release_date'], str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', row['release_date']):
                    raise ValueError
                row['release_date'] = date.fromisoformat(row['release_date'])
            except (TypeError, ValueError):
                raise CommandError(f'Release entry {index} needs an ISO date (YYYY-MM-DD).') from None
            for name in ('product_name', 'product_description'):
                if not isinstance(row[name], str) or not row[name].strip():
                    raise CommandError(f'Release entry {index} needs nonempty {name}.')
                row[name] = row[name].strip()
            validated.append(row)
        created = updated = preserved = 0
        with transaction.atomic():
            for row in validated:
                existing = AboutPageRelease.objects.filter(version_number=row['version_number']).first()
                candidate = AboutPageRelease(pk=existing.pk if existing else None, **row)
                try:
                    # An existing row was found by the unique version itself.
                    candidate.full_clean(validate_unique=existing is None)
                except ValidationError:
                    raise CommandError('Metadata violates About field constraints. No records imported.') from None
                if existing:
                    changed = [name for name in FIELDS if getattr(existing, name) != row[name]]
                    if changed and not options['update']:
                        raise CommandError('Existing metadata differs. Review and use --update deliberately; no records imported.')
                    if changed:
                        for name in changed:
                            setattr(existing, name, row[name])
                        existing.save(update_fields=[*changed, 'updated_at'])
                        updated += 1
                    else:
                        preserved += 1
                else:
                    candidate.save()
                    created += 1
        self.stdout.write(f'About releases: created {created}, updated {updated}, unchanged {preserved}.')
