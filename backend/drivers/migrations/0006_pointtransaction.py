from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_accountprofile'),
        ('drivers', '0005_driver_profile_picture'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PointTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('point_change', models.IntegerField()),
                ('reason', models.CharField(max_length=500)),
                ('changed_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by_user', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='point_transactions_created', to=settings.AUTH_USER_MODEL)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='point_transactions', to='drivers.driver')),
                ('sponsor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='point_transactions', to='accounts.sponsorcompany')),
            ],
            options={
                'ordering': ('-changed_at', '-id'),
                'indexes': [models.Index(fields=['driver', '-changed_at'], name='point_tx_driver_time_idx'), models.Index(fields=['sponsor', '-changed_at'], name='point_tx_sponsor_time_idx')],
                'constraints': [models.CheckConstraint(condition=models.Q(('point_change', 0), _negated=True), name='point_tx_change_nonzero')],
            },
        ),
    ]
