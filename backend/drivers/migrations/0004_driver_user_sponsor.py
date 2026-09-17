from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounts', '0001_initial'),
        ('drivers', '0003_remove_aboutinformation'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='driver',
            name='sponsor_id',
        ),
        migrations.AlterField(
            model_name='driver',
            name='name',
            field=models.CharField(max_length=200),
        ),
        migrations.AddField(
            model_name='driver',
            name='sponsor',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='drivers', to='accounts.sponsorcompany'),
        ),
        migrations.AddField(
            model_name='driver',
            name='user',
            field=models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='driver_profile', to=settings.AUTH_USER_MODEL),
        ),
    ]