from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0012_copy_driver_sponsor_to_memberships'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='driver',
            name='sponsor',
        ),
        migrations.RemoveField(
            model_name='driver',
            name='status',
        ),
    ]
