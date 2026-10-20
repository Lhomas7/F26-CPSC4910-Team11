from django.db import migrations

import accounts.fields


def encrypt_existing_pending_phone_numbers(apps, schema_editor):
    """Encrypt pending MFA numbers that were stored before the branches merged."""
    MFASettings = apps.get_model('accounts', 'MFASettings')
    rows = MFASettings.objects.exclude(pending_phone_number__isnull=True).exclude(
        pending_phone_number=''
    )
    for row in rows.iterator():
        row.save(update_fields=['pending_phone_number'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0011_driver_notification_preferences'),
        ('accounts', '0011_encrypt_mfa_phone_number'),
    ]

    operations = [
        migrations.AlterField(
            model_name='mfasettings',
            name='pending_phone_number',
            field=accounts.fields.EncryptedCharField(blank=True, null=True),
        ),
        migrations.RunPython(
            encrypt_existing_pending_phone_numbers,
            migrations.RunPython.noop,
        ),
    ]
