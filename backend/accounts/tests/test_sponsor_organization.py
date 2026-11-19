from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.testing import create_driver

from ..models import SponsorAccount, SponsorCompany
from .common import enroll_totp

PASSWORD = 'ExamplePassword123!'


def make_sponsor(username, company, **extra):
    user = get_user_model().objects.create_user(username=username, password=PASSWORD, **extra)
    SponsorAccount.objects.create(user=user, company=company)
    enroll_totp(user)
    return user


class SponsorRegistrationNeedsNoApplicationTests(APITestCase):
    """A sponsor is never in a pending state: signing up is enough to start working."""

    def test_new_sponsor_is_active_and_signed_in_immediately(self):
        response = self.client.post(
            reverse('accounts:sponsor-register'),
            {
                'username': 'new.sponsor',
                'password': 'Correct-Horse-Battery-99!',
                'password_confirm': 'Correct-Horse-Battery-99!',
                'accepted_terms': True,
                'first_name': 'New',
                'last_name': 'Sponsor',
                'email': 'new.sponsor@example.com',
                'company_name': 'Fresh Freight',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='new.sponsor')
        self.assertTrue(user.is_active)
        self.assertEqual(user.sponsor_account.company.name, 'Fresh Freight')
        # The new session already belongs to the sponsor; nothing waits for approval.
        self.assertEqual(self.client.get(reverse('accounts:me')).status_code, 200)


class SponsorOrganizationTests(APITestCase):
    url = reverse('accounts:sponsor-organization')

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other = SponsorCompany.objects.create(name='Blue Ridge Haulers')
        cls.sponsor = make_sponsor('dana.sponsor', cls.company)
        cls.driver_user = get_user_model().objects.create_user(
            username='marcus.driver', password=PASSWORD
        )
        cls.driver = create_driver(
            user=cls.driver_user, name='Marcus Alvarez', sponsor=cls.company, status='approved'
        )

    def test_sponsor_updates_organization_details(self):
        self.client.force_authenticate(self.sponsor)
        response = self.client.patch(
            self.url,
            {
                'description': '  We haul   produce across the Carolinas.  ',
                'website': 'https://palmetto.example.com',
                'contact_email': 'Hello@Palmetto.example.com',
                'contact_phone': '(864) 555-0100',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.company.refresh_from_db()
        self.assertEqual(self.company.description, 'We haul produce across the Carolinas.')
        self.assertEqual(self.company.website, 'https://palmetto.example.com')
        self.assertEqual(self.company.contact_email, 'hello@palmetto.example.com')
        self.assertEqual(self.company.contact_phone, '+18645550100')
        self.assertEqual(self.company.name, 'Palmetto Freight')

    def test_sponsor_sets_a_support_contact_for_drivers(self):
        self.client.force_authenticate(self.sponsor)
        response = self.client.patch(
            self.url,
            {
                'support_contact_name': '  Jordan   Lee ',
                'support_email': 'Help@Palmetto.example.com',
                'support_phone': '864.555.0199',
                'support_hours': 'Mon-Fri, 8am-5pm ET',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.company.refresh_from_db()
        self.assertEqual(self.company.support_contact_name, 'Jordan Lee')
        self.assertEqual(self.company.support_email, 'help@palmetto.example.com')
        self.assertEqual(self.company.support_phone, '+18645550199')
        self.assertEqual(self.company.support_hours, 'Mon-Fri, 8am-5pm ET')

        self.client.force_authenticate(self.driver_user)
        driver_view = self.client.get(self.url).data
        self.assertEqual(driver_view['support_email'], 'help@palmetto.example.com')
        self.assertEqual(driver_view['support_phone'], '+18645550199')

    def test_driver_can_read_their_sponsors_details(self):
        self.company.description = 'Produce hauling.'
        self.company.save()
        self.client.force_authenticate(self.driver_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Palmetto Freight')
        self.assertEqual(response.data['description'], 'Produce hauling.')
        self.assertNotIn('points_per_dollar', response.data)
        self.assertNotIn('driver_mfa_required', response.data)

    def test_driver_cannot_edit_and_unlinked_driver_gets_404(self):
        self.client.force_authenticate(self.driver_user)
        self.assertEqual(
            self.client.patch(self.url, {'description': 'x'}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.driver.memberships.all().delete()
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_404_NOT_FOUND)

    def test_sponsor_only_ever_sees_and_edits_their_own_company(self):
        self.client.force_authenticate(self.sponsor)
        self.client.patch(self.url, {'description': 'Mine'}, format='json')
        self.other.refresh_from_db()
        self.assertEqual(self.other.description, '')

    def test_invalid_details_are_rejected(self):
        self.client.force_authenticate(self.sponsor)
        for payload in (
            {'website': 'ftp://files.example.com'},
            {'website': 'not a url'},
            {'contact_email': 'nope'},
            {'contact_phone': '12'},
            {'support_email': 'nope'},
            {'support_phone': '12'},
            {'support_hours': 'x' * 201},
            {'description': 'x' * 1001},
            {'name': 'blue ridge haulers'},
            {'name': '   '},
        ):
            with self.subTest(payload=payload):
                response = self.client.patch(self.url, payload, format='json')
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_details_can_be_cleared_and_name_changed(self):
        self.company.website = 'https://old.example.com'
        self.company.save()
        self.client.force_authenticate(self.sponsor)

        response = self.client.patch(
            self.url, {'website': '', 'name': 'Palmetto Freight Co'}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.company.refresh_from_db()
        self.assertEqual(self.company.website, '')
        self.assertEqual(self.company.name, 'Palmetto Freight Co')

    def test_anonymous_and_admin_are_refused(self):
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
        admin = get_user_model().objects.create_superuser('root.admin', password=PASSWORD)
        enroll_totp(admin)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)


class SponsorTeamTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other_company = SponsorCompany.objects.create(name='Blue Ridge Haulers')
        cls.sponsor = make_sponsor('dana.sponsor', cls.company, first_name='Dana')
        cls.teammate = make_sponsor('lee.sponsor', cls.company, first_name='Lee')
        cls.outsider = make_sponsor('ona.sponsor', cls.other_company, first_name='Ona')
        cls.list_url = reverse('accounts:sponsor-team')

    def member_url(self, user):
        return reverse('accounts:sponsor-team-member', args=[user.pk])

    def test_team_lists_only_this_companys_sponsors(self):
        self.client.force_authenticate(self.sponsor)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual({m['username'] for m in response.data}, {'dana.sponsor', 'lee.sponsor'})
        me = next(m for m in response.data if m['username'] == 'dana.sponsor')
        self.assertTrue(me['is_self'])

    def test_sponsor_deactivates_a_teammate_who_can_then_no_longer_sign_in(self):
        self.client.force_authenticate(self.sponsor)

        response = self.client.patch(
            self.member_url(self.teammate),
            {'is_active': False, 'current_password': PASSWORD},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.teammate.refresh_from_db()
        self.assertFalse(self.teammate.is_active)
        self.client.force_authenticate(None)
        login = self.client.post(
            reverse('accounts:login'),
            {'username': 'lee.sponsor', 'password': PASSWORD},
            format='json',
        )
        self.assertGreaterEqual(login.status_code, 400)

    def test_deactivation_needs_the_current_password(self):
        self.client.force_authenticate(self.sponsor)
        for payload in ({'is_active': False}, {'is_active': False, 'current_password': 'bad'}):
            response = self.client.patch(self.member_url(self.teammate), payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.teammate.refresh_from_db()
        self.assertTrue(self.teammate.is_active)

    def test_teammate_can_be_reactivated(self):
        self.teammate.is_active = False
        self.teammate.save()
        self.client.force_authenticate(self.sponsor)

        response = self.client.patch(
            self.member_url(self.teammate),
            {'is_active': True, 'current_password': PASSWORD},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.teammate.refresh_from_db()
        self.assertTrue(self.teammate.is_active)

    def test_cannot_deactivate_yourself(self):
        self.client.force_authenticate(self.sponsor)
        response = self.client.patch(
            self.member_url(self.sponsor),
            {'is_active': False, 'current_password': PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'cannot_change_self')

    def test_cannot_touch_another_companys_sponsor_or_an_admin(self):
        admin = get_user_model().objects.create_superuser('root.admin', password=PASSWORD)
        SponsorAccount.objects.create(user=admin, company=self.company)
        self.client.force_authenticate(self.sponsor)
        for target in (self.outsider, admin):
            response = self.client.patch(
                self.member_url(target),
                {'is_active': False, 'current_password': PASSWORD},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.outsider.refresh_from_db()
        self.assertTrue(self.outsider.is_active)

    def test_drivers_and_anonymous_users_are_refused(self):
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
        driver = get_user_model().objects.create_user('some.driver', password=PASSWORD)
        create_driver(user=driver, name='Some Driver', sponsor=self.company)
        self.client.force_authenticate(driver)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
