from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('accounts', '0013_impersonation_termination_reason')]

    operations = [
        migrations.AddField(
            model_name='sponsorcompany',
            name='points_per_dollar',
            field=models.PositiveIntegerField(
                default=100, validators=[MinValueValidator(1), MaxValueValidator(100000)],
            ),
        ),
        migrations.AddConstraint(
            model_name='sponsorcompany',
            constraint=models.CheckConstraint(
                condition=models.Q(points_per_dollar__gte=1, points_per_dollar__lte=100000),
                name='sponsor_catalog_rate_range',
            ),
        ),
    ]
