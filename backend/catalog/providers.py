"""HTTP boundary for a future product provider; vendor mapping lives above this layer."""

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings


class ProductProviderError(Exception):
    """The configured product provider could not return usable JSON."""


class _NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


class ProductProviderClient:
    def __init__(self, *, base_url=None, api_key=None, timeout=5):
        self.base_url = (base_url if base_url is not None else settings.PRODUCT_PROVIDER_BASE_URL).rstrip('/') + '/'
        self.api_key = api_key if api_key is not None else settings.PRODUCT_PROVIDER_API_KEY
        self.timeout = timeout
        parsed = urlsplit(self.base_url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Product provider base URL must be an HTTPS origin.')
        if parsed.path != '/' or parsed.query or parsed.fragment:
            raise ValueError('Product provider base URL must be an HTTPS origin.')

    def get_json(self, path):
        """Fetch a provider-relative resource without accepting an arbitrary URL."""
        if not isinstance(path, str) or not path or path.startswith('/') or '\\' in path:
            raise ValueError('Expected a relative provider path.')
        parsed = urlsplit(path)
        if parsed.scheme or parsed.netloc or parsed.fragment or any(part == '..' for part in parsed.path.split('/')):
            raise ValueError('Expected a relative provider path.')
        headers = {'Accept': 'application/json'}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        request = Request(urljoin(self.base_url, path), headers=headers)
        try:
            with build_opener(_NoRedirects).open(request, timeout=self.timeout) as response:
                if not response.headers.get_content_type() == 'application/json':
                    raise ProductProviderError('Provider returned a non-JSON response.')
                payload = response.read(2_000_001)
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise ProductProviderError('Product provider is unavailable.') from exc
        if len(payload) > 2_000_000:
            raise ProductProviderError('Provider response is too large.')
        try:
            return json.loads(payload)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ProductProviderError('Provider returned invalid JSON.') from exc
