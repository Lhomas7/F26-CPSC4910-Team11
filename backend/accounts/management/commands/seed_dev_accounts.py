from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import SponsorAccount, SponsorCompany
from drivers.models import Driver

DEMO_PASSWORD = 'DemoSprint1!'


class Command(BaseCommand):
    help = 'Create or refresh development/demo accounts. Not for production.'

    def handle(self, *args, **options):
        User = get_user_model()

        driver_user, _ = User.objects.get_or_create(
            username='marcus',
            defaults={'first_name': 'Marcus Alvarez'},
        )
        driver_user.set_password(DEMO_PASSWORD)
        driver_user.save()
        Driver.objects.get_or_create(
            user=driver_user,
            defaults={'name': 'Marcus Alvarez', 'status': 'pending'},
        )

        sponsor_user, _ = User.objects.get_or_create(
            username='dana',
            defaults={'first_name': 'Dana Whitfield'},
        )
        sponsor_user.set_password(DEMO_PASSWORD)
        sponsor_user.save()
        company, _ = SponsorCompany.objects.get_or_create(name='Palmetto Freight')
        SponsorAccount.objects.get_or_create(user=sponsor_user, company=company)

        self.stdout.write(
            self.style.SUCCESS(
                'Development demo accounts ready. '
                'Use them only as local development credentials.'
            )
        )