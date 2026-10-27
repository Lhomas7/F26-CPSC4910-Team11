import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def category_for(message):
    # Point alerts are the only pre-existing messages that carry a reason.
    if 'Reason:' in message:
        if ' added ' in message:
            return 'points_added'
        if ' removed ' in message:
            return 'points_removed'
    return 'security'


def copy_driver_notifications(apps, schema_editor):
    DriverNotification = apps.get_model('accounts', 'DriverNotification')
    Notification = apps.get_model('accounts', 'Notification')
    for old in DriverNotification.objects.select_related('driver').iterator():
        new = Notification.objects.create(
            user_id=old.driver.user_id,
            category=category_for(old.message),
            message=old.message,
            read=old.read,
        )
        # auto_now_add ignores a passed value, so keep the original timestamp here.
        Notification.objects.filter(pk=new.pk).update(created_at=old.created_at)


def copy_back(apps, schema_editor):
    Driver = apps.get_model('drivers', 'Driver')
    DriverNotification = apps.get_model('accounts', 'DriverNotification')
    Notification = apps.get_model('accounts', 'Notification')
    drivers = dict(Driver.objects.values_list('user_id', 'pk'))
    for new in Notification.objects.filter(user_id__in=drivers).iterator():
        old = DriverNotification.objects.create(
            driver_id=drivers[new.user_id], message=new.message, read=new.read,
        )
        DriverNotification.objects.filter(pk=old.pk).update(created_at=new.created_at)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0014_sponsor_catalog_rate'),
        ('drivers', '0008_driver_phone_number'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(choices=[('points_added', 'Points added'), ('points_removed', 'Points removed'), ('sponsor_dropped', 'Dropped from sponsor'), ('security', 'Account security'), ('driver_points', "A driver's points changed")], max_length=20)),
                ('message', models.CharField(max_length=1000)),
                ('read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
                'indexes': [models.Index(fields=['user', 'read', 'created_at'], name='notification_user_read_idx')],
            },
        ),
        migrations.RunPython(copy_driver_notifications, copy_back),
        migrations.DeleteModel(name='DriverNotification'),
    ]
