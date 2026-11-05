from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import (
    DriverNotificationPreferences,
    MFASettings,
    Notification,
    SponsorAccount,
    SponsorCompany,
)
from drivers.models import Driver


class NewProductNotificationTests(APITestCase):
    url = reverse('catalog:sponsor-product-create')

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Alert Sponsor')
        cls.other_company = SponsorCompany.objects.create(name='Quiet Sponsor')
        cls.sponsor = User.objects.create_user(username='alert.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        MFASettings.objects.create(user=cls.sponsor, totp_enabled=True)

        def driver(username, **kwargs):
            user = User.objects.create_user(
                username=username, is_active=kwargs.pop('is_active', True)
            )
            fields = {'sponsor': cls.company, 'status': 'approved', **kwargs}
            return Driver.objects.create(user=user, name=username, **fields)

        cls.approved = driver('alert.approved')
        cls.opted_out = driver('alert.opted.out')
        DriverNotificationPreferences.objects.create(
            driver=cls.opted_out, new_products_enabled=False
        )
        cls.pending = driver('alert.pending', status='pending')
        cls.inactive = driver('alert.inactive', is_active=False)
        cls.other = driver('alert.other', sponsor=cls.other_company)

    def setUp(self):
        self.client.force_authenticate(self.sponsor)

    def create(self, **overrides):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.url,
                {'name': 'Safety Jacket', 'price_usd': '49.95', **overrides},
                format='json',
            )
        self.assertEqual(response.status_code, 201)
        return response

    def test_only_approved_active_opted_in_drivers_of_the_sponsor_are_notified(self):
        self.create()
        alerts = Notification.objects.filter(category=Notification.CATALOG_PRODUCT)
        self.assertEqual([a.user_id for a in alerts], [self.approved.user_id])
        self.assertEqual(
            alerts.get().message, 'New reward in the Alert Sponsor catalog: Safety Jacket'
        )

    def test_unavailable_product_sends_nothing(self):
        self.create(is_available=False)
        self.assertFalse(Notification.objects.exists())

    def test_long_names_fit_the_message_limit(self):
        self.create(name='x' * 200)
        message = Notification.objects.get().message
        self.assertLessEqual(len(message), 1000)
        self.assertTrue(message.endswith('x'))

    def test_preferences_endpoint_toggles_new_product_alerts(self):
        self.client.force_authenticate(self.approved.user)
        url = reverse('accounts:notification-preferences')
        self.assertTrue(self.client.get(url).data['new_products_enabled'])
        response = self.client.patch(url, {'new_products_enabled': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['new_products_enabled'])

        self.client.force_authenticate(self.sponsor)
        self.create()
        self.assertFalse(Notification.objects.exists())
