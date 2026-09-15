from datetime import date

from django.db import migrations, models


def add_initial_about_information(apps, schema_editor):
    AboutInformation = apps.get_model('drivers', 'AboutInformation')
    AboutInformation.objects.create(
        team_number=11,
        version='Sprint 1',
        release_date=date(2026, 9, 15),
        product_name='Good Driver Incentive Program',
        product_description=(
            'A web application that helps sponsor companies encourage safer '
            'driving by awarding points that drivers can redeem for rewards.'
        ),
    )


class Migration(migrations.Migration):
    dependencies = [('drivers', '0001_initial')]

    operations = [
        migrations.CreateModel(
            name='AboutInformation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('team_number', models.PositiveIntegerField()),
                ('version', models.CharField(max_length=50)),
                ('release_date', models.DateField()),
                ('product_name', models.CharField(max_length=150)),
                ('product_description', models.TextField()),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'about information',
                'verbose_name_plural': 'about information',
            },
        ),
        migrations.RunPython(add_initial_about_information, migrations.RunPython.noop),
    ]
