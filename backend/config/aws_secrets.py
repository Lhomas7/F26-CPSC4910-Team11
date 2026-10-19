"""Load runtime secrets from AWS Secrets Manager into the process environment.

Local development keeps using an ignored ``.env`` file. In staging/production set
``AWS_SECRETS_MANAGER_SECRET_ID`` (a secret name or ARN) and store the secrets as
one JSON object of ``KEY: value`` strings, for example::

    {'DJANGO_SECRET_KEY': '...', 'DB_PASSWORD': '...', 'TOTP_ENCRYPTION_KEY': '...'}

Rules:

* Variables already present in the real environment (or ``.env``) win, so an
  operator can always override one value without editing the secret.
* Only the names in ``ALLOWED_SECRET_KEYS`` are imported. A secret cannot inject
  arbitrary environment variables such as ``PATH`` or ``AWS_*`` credentials.
* Failures raise ``ImproperlyConfigured`` and never include secret values.
* AWS credentials come from boto3's normal chain (an instance/task/role identity in
  production); this module never reads or stores AWS keys itself.
"""

import json
import logging
import os

from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

SECRET_ID_VARIABLE = 'AWS_SECRETS_MANAGER_SECRET_ID'

ALLOWED_SECRET_KEYS = frozenset(
    {
        'DJANGO_SECRET_KEY',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD',
        'DB_HOST',
        'DB_PORT',
        'TOTP_ENCRYPTION_KEY',
        'EMAIL_HOST',
        'EMAIL_HOST_USER',
        'EMAIL_HOST_PASSWORD',
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_FROM_NUMBER',
    }
)


def _default_client_factory(region_name):
    try:
        import boto3
    except ImportError as exc:  # pragma: no cover - depends on the install
        raise ImproperlyConfigured(
            f'{SECRET_ID_VARIABLE} is set but boto3 is not installed. '
            'Run: pip install -r requirements.txt'
        ) from exc
    return boto3.client('secretsmanager', region_name=region_name)


def load_aws_secrets(environ=None, client_factory=None):
    """Copy allowed secrets into ``environ``; return the names that were set."""
    environ = os.environ if environ is None else environ
    secret_id = (environ.get(SECRET_ID_VARIABLE) or '').strip()
    if not secret_id:
        return []

    region = environ.get('AWS_REGION') or environ.get('AWS_DEFAULT_REGION') or None
    client = (client_factory or _default_client_factory)(region)

    try:
        response = client.get_secret_value(SecretId=secret_id)
    except Exception as exc:
        # botocore's ClientError carries a safe error code; never echo more.
        code = getattr(exc, 'response', {}).get('Error', {}).get('Code', type(exc).__name__)
        raise ImproperlyConfigured(
            f'Could not read AWS secret {secret_id!r} ({code}). Check the secret '
            'name, region, and the IAM permission secretsmanager:GetSecretValue.'
        ) from None

    raw = response.get('SecretString')
    if not raw:
        raise ImproperlyConfigured(
            f'AWS secret {secret_id!r} has no SecretString; store a JSON object of '
            'KEY/value pairs (binary secrets are not supported).'
        )
    try:
        values = json.loads(raw)
    except ValueError:
        raise ImproperlyConfigured(
            f'AWS secret {secret_id!r} is not valid JSON; store a JSON object of KEY/value pairs.'
        ) from None
    if not isinstance(values, dict):
        raise ImproperlyConfigured(
            f'AWS secret {secret_id!r} must be a JSON object of KEY/value pairs.'
        )

    loaded = []
    ignored = []
    for key, value in values.items():
        if key not in ALLOWED_SECRET_KEYS:
            ignored.append(str(key))
            continue
        if value is None or isinstance(value, (dict, list)):
            raise ImproperlyConfigured(
                f'AWS secret {secret_id!r}: value for {key} must be a string or number.'
            )
        if environ.get(key):
            continue  # an explicit environment value overrides the secret
        environ[key] = str(value)
        loaded.append(key)

    if ignored:
        logger.warning(
            'Ignored keys in AWS secret %r that are not recognised settings: %s',
            secret_id,
            ', '.join(sorted(ignored)),
        )
    logger.info('Loaded %d value(s) from AWS Secrets Manager.', len(loaded))
    return loaded
