from datetime import date

from django.core.management.base import BaseCommand

from about_page.models import AboutPageRelease


class Command(BaseCommand):
    help = 'Create or update the initial Team 11 About-page release.'

    def handle(self, *args, **options):
        release, created = AboutPageRelease.objects.update_or_create(
            version_number='Sprint 1',
            defaults={
                'team_number': 11,
                'release_date': date(2026, 9, 15),
                'product_name': 'Good Driver Incentive Program',
                'product_description': (
                    'A rewards program that helps sponsors encourage safer '
                    'driving through points and incentives.'
                ),
            },
        )

        action = 'Created' if created else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(f'{action} About-page release: {release.version_number}')
        )
