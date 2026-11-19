import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0021_sponsor_organization_profile'),
        ('drivers', '0010_sponsor_behaviors'),
    ]

    operations = [
        migrations.CreateModel(
            name='DriverSponsorMembership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('dropped', 'Dropped')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='drivers.driver')),
                ('sponsor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='driver_memberships', to='accounts.sponsorcompany')),
            ],
            options={
                'ordering': ('sponsor__name', 'id'),
                'indexes': [models.Index(fields=['sponsor', 'status'], name='driver_membership_sponsor_idx')],
                'constraints': [models.UniqueConstraint(fields=('driver', 'sponsor'), name='driver_membership_unique_sponsor')],
            },
        ),
        migrations.AlterField(
            model_name='driverstatuschange',
            name='action',
            field=models.CharField(choices=[('applied', 'Applied to sponsor'), ('approved', 'Approved application'), ('rejected', 'Rejected application'), ('dropped', 'Dropped from sponsor'), ('assigned', 'Assigned by administrator'), ('removed', 'Removed by administrator')], max_length=20),
        ),
        migrations.AlterField(
            model_name='driverstatuschange',
            name='reason',
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
