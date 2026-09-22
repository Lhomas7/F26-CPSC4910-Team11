from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounts', '0001_initial'),
        ('drivers', '0004_driver_user_sponsor'),
    ]

    operations = [
        migrations.AddField(
            model_name='sponsorcompany',
            name='driver_mfa_required',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='MFASettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('totp_secret_encrypted', models.BinaryField(blank=True, null=True)),
                ('totp_enabled', models.BooleanField(default=False)),
                ('email_enabled', models.BooleanField(default=False)),
                ('sms_enabled', models.BooleanField(default=False)),
                ('phone_number', models.CharField(blank=True, max_length=20, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='mfa_settings', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='MFACode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('purpose', models.CharField(choices=[('enroll', 'Enroll'), ('login', 'Login'), ('reset', 'Reset')], max_length=10)),
                ('method', models.CharField(choices=[('email', 'Email'), ('sms', 'SMS')], max_length=10)),
                ('code_hash', models.CharField(max_length=128)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('used', models.BooleanField(default=False)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mfa_codes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['user', 'purpose', 'used'], name='mfacode_user_purpose_used_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='DriverNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('message', models.CharField(max_length=500)),
                ('read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='drivers.driver')),
            ],
        ),
    ]