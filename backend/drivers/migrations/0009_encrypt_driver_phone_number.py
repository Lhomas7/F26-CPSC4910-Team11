from django.db import migrations

import accounts.fields


def encrypt_existing_phone_numbers(apps, schema_editor):
    """Re-save every stored number so the field encrypts it (safe to run twice)."""
    Driver = apps.get_model('drivers', 'Driver')
    for driver in Driver.objects.exclude(phone_number='').iterator():
        driver.save(update_fields=['phone_number'])


class Migration(migrations.Migration):
    dependencies = [
        ('drivers', '0008_driver_phone_number'),
        ('accounts', '0011_encrypt_mfa_phone_number'),
    ]

    operations = [
        migrations.AlterField(
            model_name='driver',
            name='phone_number',
            field=accounts.fields.EncryptedCharField(blank=True),
        ),
        migrations.RunPython(encrypt_existing_phone_numbers, migrations.RunPython.noop),
    ]
