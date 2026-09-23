import json

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from .aws_secrets import SECRET_ID_VARIABLE, load_aws_secrets


class FakeSecretsClient:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.requested = []

    def get_secret_value(self, SecretId):
        self.requested.append(SecretId)
        if self.error is not None:
            raise self.error
        return self.response


class FakeClientError(Exception):
    """Stands in for botocore's ClientError, which exposes ``.response``."""

    def __init__(self, code):
        super().__init__(f'{code}: sensitive details that must not be repeated')
        self.response = {'Error': {'Code': code}}


def secret_response(values):
    return {'SecretString': json.dumps(values)}


class LoadAwsSecretsTests(SimpleTestCase):
    def load(self, environ, client):
        regions = []

        def factory(region):
            regions.append(region)
            return client

        loaded = load_aws_secrets(environ=environ, client_factory=factory)
        return loaded, regions

    def test_does_nothing_when_no_secret_id_is_configured(self):
        environ = {}
        client = FakeSecretsClient(response=secret_response({'DB_PASSWORD': 'x'}))

        loaded, regions = self.load(environ, client)

        self.assertEqual(loaded, [])
        self.assertEqual(regions, [])
        self.assertEqual(client.requested, [])
        self.assertEqual(environ, {})

    def test_loads_allowed_keys_into_the_environment(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod', 'AWS_REGION': 'us-east-1'}
        client = FakeSecretsClient(response=secret_response({
            'DJANGO_SECRET_KEY': 'signing-key',
            'DB_PASSWORD': 'db-pass',
            'DB_PORT': 3306,
        }))

        loaded, regions = self.load(environ, client)

        self.assertEqual(sorted(loaded), ['DB_PASSWORD', 'DB_PORT', 'DJANGO_SECRET_KEY'])
        self.assertEqual(environ['DJANGO_SECRET_KEY'], 'signing-key')
        self.assertEqual(environ['DB_PORT'], '3306')
        self.assertEqual(client.requested, ['gooddriver/prod'])
        self.assertEqual(regions, ['us-east-1'])

    def test_existing_environment_values_take_precedence(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod', 'DB_PASSWORD': 'from-env'}
        client = FakeSecretsClient(response=secret_response({'DB_PASSWORD': 'from-secret'}))

        loaded, _ = self.load(environ, client)

        self.assertEqual(loaded, [])
        self.assertEqual(environ['DB_PASSWORD'], 'from-env')

    def test_unrecognised_keys_are_not_imported(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod'}
        client = FakeSecretsClient(response=secret_response({
            'PATH': '/tmp/evil',
            'AWS_SECRET_ACCESS_KEY': 'nope',
            'DB_USER': 'app',
        }))

        with self.assertLogs('config.aws_secrets', level='WARNING') as logs:
            self.load(environ, client)

        self.assertNotIn('PATH', environ)
        self.assertNotIn('AWS_SECRET_ACCESS_KEY', environ)
        self.assertEqual(environ['DB_USER'], 'app')
        # Key names are logged so typos are findable; values never are.
        self.assertIn('PATH', logs.output[0])
        self.assertNotIn('/tmp/evil', logs.output[0])

    def test_aws_errors_raise_without_echoing_details(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod'}
        client = FakeSecretsClient(error=FakeClientError('AccessDeniedException'))

        with self.assertRaises(ImproperlyConfigured) as raised:
            self.load(environ, client)

        message = str(raised.exception)
        self.assertIn('AccessDeniedException', message)
        self.assertIn('secretsmanager:GetSecretValue', message)
        self.assertNotIn('sensitive details', message)

    def test_invalid_json_is_rejected(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod'}
        client = FakeSecretsClient(response={'SecretString': 'DB_PASSWORD=plain-text'})

        with self.assertRaises(ImproperlyConfigured) as raised:
            self.load(environ, client)

        self.assertNotIn('plain-text', str(raised.exception))

    def test_non_object_json_is_rejected(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod'}
        client = FakeSecretsClient(response={'SecretString': '["a", "b"]'})

        with self.assertRaises(ImproperlyConfigured):
            self.load(environ, client)

    def test_binary_secret_is_rejected(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod'}
        client = FakeSecretsClient(response={'SecretBinary': b'bytes'})

        with self.assertRaises(ImproperlyConfigured):
            self.load(environ, client)

    def test_nested_values_are_rejected(self):
        environ = {SECRET_ID_VARIABLE: 'gooddriver/prod'}
        client = FakeSecretsClient(response=secret_response({'DB_HOST': {'nested': 'x'}}))

        with self.assertRaises(ImproperlyConfigured):
            self.load(environ, client)
