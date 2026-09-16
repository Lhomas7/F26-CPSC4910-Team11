from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('about_page', '0001_initial'),
        ('drivers', '0002_aboutinformation'),
    ]

    operations = [
        migrations.DeleteModel(name='AboutInformation'),
    ]
