from django.db import migrations

import accounts.fields


def encrypt_existing_phone_numbers(apps, schema_editor):
    """Re-save every stored number so the field encrypts it.

    Legacy plaintext reads back unchanged (see EncryptedCharField.from_db_value),
    and saving writes it as ciphertext. Safe to run twice.
    """
    MFASettings = apps.get_model('accounts', 'MFASettings')
    rows = MFASettings.objects.exclude(phone_number__isnull=True).exclude(phone_number='')
    for row in rows.iterator():
        row.save(update_fields=['phone_number'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0010_login_throttle_index_admin_reset_event'),
    ]

    operations = [
        migrations.AlterField(
            model_name='mfasettings',
            name='phone_number',
            field=accounts.fields.EncryptedCharField(blank=True, null=True),
        ),
        migrations.RunPython(encrypt_existing_phone_numbers, migrations.RunPython.noop),
    ]
