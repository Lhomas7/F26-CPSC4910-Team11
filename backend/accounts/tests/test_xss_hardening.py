"""User text is stored and returned as data, and API responses can't be sniffed as HTML."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver
from drivers.services.points import adjust_driver_points

from ..models import Notification, SponsorAccount, SponsorCompany

SCRIPT_REASON = '<script>alert(document.cookie)</script> & <img src=x onerror=alert(1)>'


class XssHardeningTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Escape Freight')
        cls.sponsor = User.objects.create_user(username='xss.sponsor', password='x')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        cls.driver_user = User.objects.create_user(username='xss.driver', password='x')
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Escape Driver', sponsor=cls.company, status='approved'
        )

    def test_api_responses_forbid_sniffing_and_framing(self):
        response = self.client.get(reverse('accounts:me'))

        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response['X-Frame-Options'], 'DENY')
        self.assertTrue(response['Content-Type'].startswith('application/json'))

    def test_markup_in_a_point_reason_comes_back_as_literal_text(self):
        with self.captureOnCommitCallbacks(execute=True):
            adjust_driver_points(
                driver=self.driver,
                changed_by_user=self.sponsor,
                point_change=5,
                reason=SCRIPT_REASON,
            )
        self.assertIn(SCRIPT_REASON, Notification.objects.get(user=self.driver_user).message)

        self.client.force_authenticate(self.driver_user)
        response = self.client.get(reverse('accounts:notifications'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(SCRIPT_REASON, response.data['results'][0]['message'])
        # JSON keeps the characters as-is; it's the frontend's job to render them as text.
        self.assertIn(b'<script>', response.content)
        self.assertTrue(response['Content-Type'].startswith('application/json'))
