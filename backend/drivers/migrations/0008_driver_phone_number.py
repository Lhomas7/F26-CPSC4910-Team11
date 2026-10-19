from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('drivers', '0007_driverstatuschange'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='phone_number',
            field=models.CharField(blank=True, max_length=16),
        ),
    ]
