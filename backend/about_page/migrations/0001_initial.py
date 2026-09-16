from django.db import migrations, models


def copy_existing_release(apps, schema_editor):
    AboutInformation = apps.get_model('drivers', 'AboutInformation')
    AboutPageRelease = apps.get_model('about_page', 'AboutPageRelease')

    for release in AboutInformation.objects.all().iterator():
        AboutPageRelease.objects.get_or_create(
            version_number=release.version,
            defaults={
                'team_number': release.team_number,
                'release_date': release.release_date,
                'product_name': release.product_name,
                'product_description': release.product_description,
            },
        )


class Migration(migrations.Migration):
    initial = True

    dependencies = [('drivers', '0002_aboutinformation')]

    operations = [
        migrations.CreateModel(
            name='AboutPageRelease',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('team_number', models.PositiveSmallIntegerField()),
                ('version_number', models.CharField(max_length=30, unique=True)),
                ('release_date', models.DateField()),
                ('product_name', models.CharField(max_length=100)),
                ('product_description', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'About page release',
                'verbose_name_plural': 'About page releases',
                'ordering': ('-release_date', '-updated_at'),
            },
        ),
        migrations.RunPython(copy_existing_release, migrations.RunPython.noop),
    ]
