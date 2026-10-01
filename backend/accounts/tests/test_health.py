import logging
import re
from contextlib import contextmanager
from datetime import timedelta
from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pyotp

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import (
    AdminImpersonationEvent,
    DriverNotification,
    LoginAttempt,
    MFABackupCode,
    MFACode,
    MFASettings,
    SponsorAccount,
    SponsorCompany,
)
from ..middleware import IMPERSONATION_STARTED_KEY
from ..services.crypto import decrypt_secret, encrypt_secret
from ..services.mfa import backup_codes_remaining, create_mfa_code

class HealthCheckTests(APITestCase):
    def test_health_reports_ok_when_the_database_is_reachable(self):
        response = self.client.get(reverse('health'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {'status': 'ok'})

