from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0018_notification_driver_application'),
    ]

    operations = [
        migrations.AddField(
            model_name='drivernotificationpreferences',
            name='new_products_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name='notification',
            name='category',
            field=models.CharField(
                choices=[
                    ('points_added', 'Points added'),
                    ('points_removed', 'Points removed'),
                    ('sponsor_dropped', 'Dropped from sponsor'),
                    ('security', 'Account security'),
                    ('driver_points', "A driver's points changed"),
                    ('driver_application', 'A driver applied'),
                    ('catalog_product', 'New reward'),
                ],
                max_length=20,
            ),
        ),
    ]
