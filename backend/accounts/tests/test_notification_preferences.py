from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..models import DriverNotificationPreferences, MFASettings, SponsorAccount, SponsorCompany


class NotificationPreferencesViewTests(APITestCase):
    url = reverse('accounts:notification-preferences')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.driver_user = User.objects.create_user(
            username='driver.one', password='ExamplePassword123!'
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user,
            name='Driver One',
            sponsor=cls.company,
            status='approved',
            phone_number='+18645550100',
        )
        cls.sponsor = User.objects.create_user(
            username='sponsor.one', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        cls.admin = User.objects.create_superuser(
            username='admin.one', password='ExamplePassword123!'
        )
        for user in (cls.sponsor, cls.admin):
            MFASettings.objects.create(user=user, totp_enabled=True)

    def sign_in_driver(self):
        # Load the user fresh, as a real request would, so updates made in a
        # test are not hidden behind relations cached during setUpTestData.
        self.client.force_authenticate(get_user_model().objects.get(pk=self.driver_user.pk))

    def test_new_driver_gets_defaults(self):
        self.sign_in_driver()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                'points_added_enabled': True,
                'points_removed_enabled': True,
                'email_enabled': True,
                'sms_enabled': False,
                'sms_available': True,
            },
        )

    def test_changes_are_saved_to_the_profile(self):
        self.sign_in_driver()

        response = self.client.patch(
            self.url,
            {'points_removed_enabled': False, 'email_enabled': False, 'sms_enabled': True},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.sign_in_driver()
        saved = self.client.get(self.url).data
        self.assertTrue(saved['points_added_enabled'])
        self.assertFalse(saved['points_removed_enabled'])
        self.assertFalse(saved['email_enabled'])
        self.assertTrue(saved['sms_enabled'])
        self.assertEqual(DriverNotificationPreferences.objects.count(), 1)

    def test_text_alerts_need_a_phone_number(self):
        Driver.objects.filter(pk=self.driver.pk).update(phone_number='')
        self.sign_in_driver()

        self.assertFalse(self.client.get(self.url).data['sms_available'])
        response = self.client.patch(self.url, {'sms_enabled': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone number', str(response.data['sms_enabled']))
        self.assertFalse(DriverNotificationPreferences.for_driver(self.driver).sms_enabled)

    def test_other_account_types_are_refused(self):
        for user in (self.sponsor, self.admin):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
            response = self.client.patch(self.url, {'email_enabled': False}, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.get(self.url).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_driver_must_enroll_mfa_when_sponsor_requires_it(self):
        SponsorCompany.objects.filter(pk=self.company.pk).update(driver_mfa_required=True)
        self.sign_in_driver()

        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
