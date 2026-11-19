from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.active_sponsor import SESSION_KEY
from drivers.models import DriverSponsorMembership
from drivers.testing import add_membership, create_driver

from ..models import RegistrationSettings, SponsorAccount, SponsorCompany

PASSWORD = 'ExamplePassword123!'


class HelpContactsTests(APITestCase):
    url = reverse('accounts:help-contacts')

    @classmethod
    def setUpTestData(cls):
        cls.palmetto = SponsorCompany.objects.create(
            name='Palmetto Freight',
            contact_email='hello@palmetto.example.com',
            contact_phone='+18645550100',
            support_contact_name='Jordan Lee',
            support_email='help@palmetto.example.com',
            support_hours='Mon-Fri, 8am-5pm ET',
        )
        cls.blue_ridge = SponsorCompany.objects.create(
            name='Blue Ridge Haulers', contact_email='info@blueridge.example.com'
        )
        cls.coastal = SponsorCompany.objects.create(name='Coastal Carriers')
        cls.dropped = SponsorCompany.objects.create(name='Dropped Logistics')
        cls.driver_user = get_user_model().objects.create_user(
            username='marcus.driver', password=PASSWORD
        )
        cls.driver = create_driver(
            user=cls.driver_user,
            name='Marcus Alvarez',
            sponsor=cls.palmetto,
            status=DriverSponsorMembership.APPROVED,
        )
        add_membership(cls.driver, cls.blue_ridge, DriverSponsorMembership.APPROVED)
        add_membership(cls.driver, cls.coastal, DriverSponsorMembership.PENDING)
        add_membership(cls.driver, cls.dropped, DriverSponsorMembership.DROPPED)
        settings_row = RegistrationSettings.load()
        settings_row.support_email = 'support@gooddriver.example.com'
        settings_row.support_phone = '+18005550123'
        settings_row.save()

    def test_driver_sees_their_sponsors_and_admin_support(self):
        self.client.force_authenticate(self.driver_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['admin'],
            {'email': 'support@gooddriver.example.com', 'phone': '+18005550123'},
        )
        names = [sponsor['name'] for sponsor in response.data['sponsors']]
        # The active sponsor (first approved by name) leads; dropped sponsors are left out.
        self.assertEqual(names, ['Blue Ridge Haulers', 'Coastal Carriers', 'Palmetto Freight'])
        self.assertEqual(
            [sponsor['active'] for sponsor in response.data['sponsors']], [True, False, False]
        )

    def test_support_contact_falls_back_to_public_details(self):
        self.client.force_authenticate(self.driver_user)

        sponsors = {s['name']: s for s in self.client.get(self.url).data['sponsors']}

        palmetto = sponsors['Palmetto Freight']
        self.assertEqual(palmetto['contact_name'], 'Jordan Lee')
        self.assertEqual(palmetto['email'], 'help@palmetto.example.com')
        self.assertEqual(palmetto['phone'], '+18645550100')
        self.assertEqual(palmetto['hours'], 'Mon-Fri, 8am-5pm ET')
        self.assertEqual(sponsors['Blue Ridge Haulers']['email'], 'info@blueridge.example.com')
        self.assertEqual(sponsors['Coastal Carriers']['email'], '')

    def test_chosen_sponsor_is_listed_first(self):
        self.client.force_authenticate(self.driver_user)
        session = self.client.session
        session[SESSION_KEY] = self.palmetto.id
        session.save()

        sponsors = self.client.get(self.url).data['sponsors']

        self.assertEqual(sponsors[0]['name'], 'Palmetto Freight')
        self.assertTrue(sponsors[0]['active'])

    def test_sponsors_and_admins_see_only_admin_support(self):
        sponsor_user = get_user_model().objects.create_user(
            username='dana.sponsor', password=PASSWORD
        )
        SponsorAccount.objects.create(user=sponsor_user, company=self.palmetto)
        admin = get_user_model().objects.create_superuser('root.admin', password=PASSWORD)

        for user in (sponsor_user, admin):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                response = self.client.get(self.url)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data['sponsors'], [])
                self.assertEqual(
                    response.data['admin']['email'], 'support@gooddriver.example.com'
                )

    def test_unlinked_driver_and_blank_settings(self):
        RegistrationSettings.objects.update(support_email='', support_phone='')
        user = get_user_model().objects.create_user(username='new.driver', password=PASSWORD)
        create_driver(user=user, name='New Driver')
        self.client.force_authenticate(user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'admin': {'email': '', 'phone': ''}, 'sponsors': []})

    def test_anonymous_is_refused(self):
        self.assertIn(
            self.client.get(self.url).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
