import decimal

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('accounts', '0017_password_history'),
        ('drivers', '0009_encrypt_driver_phone_number'),
    ]

    operations = [
        migrations.CreateModel(
            name='CompletedSale',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(max_length=100, unique=True)),
                ('gross_amount_usd', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.00'))])),
                ('project_share_usd', models.DecimalField(decimal_places=4, editable=False, max_digits=14, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.0000'))])),
                ('completed_at', models.DateTimeField()),
                ('recorded_at', models.DateTimeField(auto_now_add=True)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='completed_sales', to='drivers.driver')),
                ('sponsor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='completed_sales', to='accounts.sponsorcompany')),
            ],
            options={
                'ordering': ('-completed_at', '-id'),
                'indexes': [
                    models.Index(fields=['sponsor', '-completed_at'], name='sale_sponsor_time_idx'),
                    models.Index(fields=['driver', '-completed_at'], name='sale_driver_time_idx'),
                ],
                'constraints': [
                    models.CheckConstraint(condition=models.Q(('gross_amount_usd__gte', 0)), name='completed_sale_gross_nonnegative'),
                    models.CheckConstraint(condition=models.Q(('project_share_usd__gte', 0)), name='completed_sale_share_nonnegative'),
                ],
            },
        ),
    ]

