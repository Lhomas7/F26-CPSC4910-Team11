import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
        ('drivers', '0009_encrypt_driver_phone_number'),
    ]

    operations = [
        migrations.CreateModel(
            name='CartItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('added_at', models.DateTimeField(auto_now_add=True)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cart_items', to='drivers.driver')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cart_items', to='catalog.catalogproduct')),
            ],
            options={
                'ordering': ('-added_at', '-id'),
                'constraints': [models.UniqueConstraint(fields=('driver', 'product'), name='catalog_cart_driver_product_unique')],
            },
        ),
    ]
