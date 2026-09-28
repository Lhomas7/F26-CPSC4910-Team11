from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SponsorAccount, SponsorCompany
from accounts.tests import enroll_totp

from .models import Driver


class DriverViewSetMFAGateTests(APITestCase):
    """The MFAEnrolled permission (accounts/permissions.py) applied to this
    viewset should block sponsors until they enroll, and block a driver only
    when their sponsor company has opted every driver into required MFA.
    """

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Acme Co')
        cls.sponsor_user = get_user_model().objects.create_user(
            username='fleet.sponsor', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.driver_user = get_user_model().objects.create_user(
            username='fleet.driver', password='ExamplePassword123!'
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Fleet Driver', sponsor=cls.company
        )

    def test_sponsor_blocked_from_managing_drivers_until_enrolled(self):
        self.client.force_authenticate(self.sponsor_user)

        before = self.client.get(reverse('driver-list'))
        self.assertEqual(before.status_code, status.HTTP_403_FORBIDDEN)

        enroll_totp(self.sponsor_user)

        after = self.client.get(reverse('driver-list'))
        self.assertEqual(after.status_code, status.HTTP_200_OK)

    def test_driver_only_blocked_when_companys_mfa_is_required(self):
        self.client.force_authenticate(self.driver_user)

        # Not required yet: the driver can see their own record.
        response = self.client.get(reverse('driver-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.company.driver_mfa_required = True
        self.company.save(update_fields=['driver_mfa_required'])

        blocked = self.client.get(reverse('driver-list'))
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

        enroll_totp(self.driver_user)

        allowed = self.client.get(reverse('driver-list'))
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
