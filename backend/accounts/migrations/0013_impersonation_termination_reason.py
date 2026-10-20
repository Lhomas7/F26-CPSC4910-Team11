from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0012_merge_encrypt_pending_mfa_phone'),
    ]

    operations = [
        migrations.AddField(
            model_name='adminimpersonationevent',
            name='reason',
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AlterField(
            model_name='adminimpersonationevent',
            name='action',
            field=models.CharField(
                choices=[('start', 'Started'), ('stop', 'Stopped'),
                         ('expire', 'Expired'), ('invalidate', 'Invalidated')],
                max_length=10,
            ),
        ),
    ]
