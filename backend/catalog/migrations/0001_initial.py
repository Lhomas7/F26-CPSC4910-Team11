import decimal

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CatalogProduct',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True, max_length=5000, validators=[django.core.validators.MaxLengthValidator(5000)])),
                ('image_url', models.URLField(blank=True, max_length=2048, validators=[django.core.validators.URLValidator(schemes=['https'])])),
                ('price_usd', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.00'))])),
                ('is_available', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('sponsor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='catalog_products', to='accounts.sponsorcompany')),
            ],
            options={
                'ordering': ('name', 'id'),
                'indexes': [models.Index(fields=['sponsor', 'is_available'], name='catalog_sponsor_available_idx')],
                'constraints': [
                    models.CheckConstraint(condition=models.Q(('price_usd__gte', 0)), name='catalog_product_price_nonnegative'),
                    models.CheckConstraint(condition=~models.Q(('name', '')), name='catalog_product_name_nonempty'),
                ],
            },
        ),
    ]
