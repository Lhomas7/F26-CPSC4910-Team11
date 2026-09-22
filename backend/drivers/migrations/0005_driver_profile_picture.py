import django.core.validators
from django.db import migrations, models

import drivers.models


class Migration(migrations.Migration):
    dependencies = [
        ('drivers', '0004_driver_user_sponsor'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='profile_picture',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=drivers.models.profile_picture_upload_to,
                validators=[
                    django.core.validators.FileExtensionValidator(
                        ['jpg', 'jpeg', 'png', 'webp']
                    )
                ],
            ),
        ),
    ]
