from django.db import migrations, models


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
    ]
