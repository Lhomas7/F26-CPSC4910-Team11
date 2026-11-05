import io
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from catalog.providers import ProductProviderClient, ProductProviderError


class ProductProviderClientTests(SimpleTestCase):
    def test_fetches_json_with_server_side_credential_and_timeout(self):
        response = io.BytesIO(b'{"id":"sku-1"}')
        response.headers = Mock(get_content_type=Mock(return_value='application/json'))
        with patch('catalog.providers.build_opener') as build_opener:
            build_opener.return_value.open.return_value.__enter__.return_value = response
            result = ProductProviderClient(
                base_url='https://products.example.com', api_key='private', timeout=3
            ).get_json('items/sku-1')
        self.assertEqual(result, {'id': 'sku-1'})
        request = build_opener.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, 'https://products.example.com/items/sku-1')
        self.assertEqual(request.get_header('Authorization'), 'Bearer private')
        self.assertIn('GoodDriverIncentiveProgram', request.get_header('User-agent'))
        self.assertEqual(build_opener.return_value.open.call_args.kwargs['timeout'], 3)

    def test_rejects_untrusted_origins_and_paths(self):
        for origin in ('', 'http://products.example.com', 'https://user:pass@products.example.com'):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                ProductProviderClient(base_url=origin)
        client = ProductProviderClient(base_url='https://products.example.com')
        for path in ('https://other.example.com/items', '//other.example.com', '../secret', '/items'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                client.get_json(path)

    def test_invalid_json_is_normalized_to_provider_error(self):
        response = io.BytesIO(b'not json')
        response.headers = Mock(get_content_type=Mock(return_value='application/json'))
        with patch('catalog.providers.build_opener') as build_opener:
            build_opener.return_value.open.return_value.__enter__.return_value = response
            with self.assertRaises(ProductProviderError):
                ProductProviderClient(base_url='https://products.example.com').get_json('items')
