from django.db import migrations


def copy_sponsor_links(apps, schema_editor):
    """Existing drivers keep their one sponsor and status as a membership."""
    Driver = apps.get_model('drivers', 'Driver')
    Membership = apps.get_model('drivers', 'DriverSponsorMembership')
    Membership.objects.bulk_create(
        Membership(driver_id=driver_id, sponsor_id=sponsor_id, status=status)
        for driver_id, sponsor_id, status in Driver.objects.filter(
            sponsor__isnull=False
        ).values_list('id', 'sponsor_id', 'status')
    )


def restore_sponsor_links(apps, schema_editor):
    """Keep one active membership per driver, preferring an approved one."""
    Driver = apps.get_model('drivers', 'Driver')
    Membership = apps.get_model('drivers', 'DriverSponsorMembership')
    memberships = Membership.objects.filter(status__in=('pending', 'approved')).order_by(
        'driver_id', 'status', 'id'
    )
    restored = set()
    for membership in memberships:
        # 'approved' sorts before 'pending', so the first row wins.
        if membership.driver_id in restored:
            continue
        restored.add(membership.driver_id)
        Driver.objects.filter(pk=membership.driver_id).update(
            sponsor_id=membership.sponsor_id, status=membership.status
        )


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0011_driversponsormembership'),
    ]

    operations = [
        migrations.RunPython(copy_sponsor_links, restore_sponsor_links),
    ]
