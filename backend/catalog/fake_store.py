"""Fake Store API product mapping. Its catalog is demo data, not live stock."""

from decimal import Decimal, InvalidOperation

from rest_framework.exceptions import ValidationError

from catalog.providers import ProductProviderClient, ProductProviderError
from catalog.serializers import ProductCreateSerializer

PROVIDER_NAME = 'fake_store'


def normalize_product(raw):
    if not isinstance(raw, dict) or isinstance(raw.get('id'), bool) or not isinstance(raw.get('id'), int) or raw['id'] < 1:
        raise ProductProviderError('Provider returned an invalid product ID.')
    try:
        price = Decimal(str(raw['price']))
    except (KeyError, TypeError, InvalidOperation) as exc:
        raise ProductProviderError('Provider returned an invalid product price.') from exc
    serializer = ProductCreateSerializer(data={
        'name': raw.get('title'),
        'description': raw.get('description', ''),
        'image_url': raw.get('image', ''),
        'price_usd': str(price),
    })
    if not serializer.is_valid():
        raise ProductProviderError('Provider returned unusable product details.')
    return {'provider': PROVIDER_NAME, 'external_product_id': str(raw['id']),
            **serializer.validated_data}


def get_product(product_id):
    if not isinstance(product_id, int) or product_id < 1:
        raise ValidationError({'product_id': 'Enter a positive product ID.'})
    product = normalize_product(ProductProviderClient().get_json(f'products/{product_id}'))
    if product['external_product_id'] != str(product_id):
        raise ProductProviderError('Provider returned a different product.')
    return product


def search_products(query):
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 100:
        raise ValidationError({'q': 'Enter a search term of 1 to 100 characters.'})
    products = ProductProviderClient().get_json('products')
    if not isinstance(products, list):
        raise ProductProviderError('Provider returned an invalid product list.')
    matches = []
    for raw in products:
        if isinstance(raw, dict) and query.casefold().strip() in str(raw.get('title', '')).casefold():
            matches.append(normalize_product(raw))
    return matches[:30]
