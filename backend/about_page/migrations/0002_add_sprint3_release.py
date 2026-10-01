from datetime import date

from django.db import migrations


def add_sprint3_release(apps, schema_editor):
    AboutPageRelease = apps.get_model("about_page", "AboutPageRelease")

    AboutPageRelease.objects.update_or_create(
        version_number="Sprint 3",
        defaults={
            "team_number": 11,
            "release_date": date(2026, 9, 30),
            "product_name": "Good Driver Incentive Program",
            "product_description": (
                "A role-based driver incentive platform that gives drivers, "
                "sponsors, and administrators secure tools for managing "
                "accounts, safer-driving participation, and program access."
            ),
        },
    )


def remove_sprint3_release(apps, schema_editor):
    AboutPageRelease = apps.get_model("about_page", "AboutPageRelease")
    AboutPageRelease.objects.filter(version_number="Sprint 3").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("about_page", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            add_sprint3_release,
            remove_sprint3_release,
        ),
    ]
