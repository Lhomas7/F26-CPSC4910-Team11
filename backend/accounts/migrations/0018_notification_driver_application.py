from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0017_password_history'),
    ]

    operations = [
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
                    ('driver_application', 'A driver applied to your company'),
                ],
                max_length=20,
            ),
        ),
    ]
