"""Driver-side sponsor APIs: the public list, registration, applying, and switching."""

import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from accounts.middleware import (
    IMPERSONATION_ROLE_KEY,
    IMPERSONATION_STARTED_KEY,
    IMPERSONATION_TARGET_KEY,
)
from accounts.models import Notification, RegistrationSettings, SponsorAccount, SponsorCompany
from accounts.serializers.registration import MAX_SPONSOR_APPLICATIONS
from accounts.tests.common import enroll_totp

from .active_sponsor import SESSION_KEY
from .models import DriverSponsorMembership, DriverStatusChange, PointTransaction
from .services import remove_driver_from_sponsor
from .testing import add_membership, create_driver, membership_status

APPROVED = DriverSponsorMembership.APPROVED
PENDING = DriverSponsorMembership.PENDING
REJECTED = DriverSponsorMembership.REJECTED


def make_sponsor(name, username, *, active=True):
    company = SponsorCompany.objects.create(name=name)
    user = get_user_model().objects.create_user(username=username, is_active=active)
    SponsorAccount.objects.create(user=user, company=company)
    enroll_totp(user)
    return company, user


class SponsorDataMixin:
    @classmethod
    def setUpTestData(cls):
        cls.alpha, cls.alpha_user = make_sponsor('Alpha Freight', 'alpha.sponsor')
        cls.beta, cls.beta_user = make_sponsor('Beta Haulers', 'beta.sponsor')
        cls.closed, _ = make_sponsor('Closed Lines', 'closed.sponsor', active=False)
        cls.empty = SponsorCompany.objects.create(name='No Sponsor Users')


class PublicSponsorListTests(SponsorDataMixin, APITestCase):
    url = reverse('accounts:public-sponsors')

    def test_lists_companies_with_an_active_sponsor_user_by_name_only(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            [{'id': self.alpha.pk, 'name': 'Alpha Freight'},
             {'id': self.beta.pk, 'name': 'Beta Haulers'}],
        )


class RegistrationWithSponsorsTests(SponsorDataMixin, APITestCase):
    url = reverse('accounts:driver-register')

    def setUp(self):
        cache.clear()
        mail.outbox = []

    def data(self, **overrides):
        return {
            'first_name': 'Jamie',
            'last_name': 'Rivera',
            'email': 'jamie@example.com',
            'username': 'jamie.rivera',
            'password': 'ExamplePassword123!',
            'password_confirm': 'ExamplePassword123!',
            'accepted_terms': True,
            **overrides,
        }

    def driver(self):
        return get_user_model().objects.get(username='jamie.rivera').driver_profile

    def test_applies_to_each_chosen_sponsor_once(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.url,
                self.data(sponsor_ids=[self.alpha.pk, self.beta.pk, self.alpha.pk]),
                format='json',
            )

        self.assertEqual(response.status_code, 201)
        driver = self.driver()
        self.assertEqual(membership_status(driver, self.alpha), PENDING)
        self.assertEqual(membership_status(driver, self.beta), PENDING)
        self.assertEqual(
            DriverStatusChange.objects.filter(driver=driver, action=DriverStatusChange.APPLIED).count(),
            2,
        )
        for sponsor_user in (self.alpha_user, self.beta_user):
            self.assertTrue(
                Notification.objects.filter(
                    user=sponsor_user, category=Notification.DRIVER_APPLICATION
                ).exists()
            )

    def test_choosing_no_sponsor_is_allowed(self):
        response = self.client.post(self.url, self.data(), format='json')

        self.assertEqual(response.status_code, 201)
        self.assertFalse(self.driver().memberships.exists())

    def test_refuses_unknown_and_inactive_sponsors_without_creating_the_account(self):
        for sponsor_id in (999999, self.closed.pk, self.empty.pk):
            response = self.client.post(self.url, self.data(sponsor_ids=[sponsor_id]), format='json')
            self.assertEqual(response.status_code, 400)
            self.assertIn('sponsor_ids', response.data)
        self.assertFalse(get_user_model().objects.filter(username='jamie.rivera').exists())

    def test_refuses_too_many_sponsors(self):
        ids = [self.alpha.pk] * (MAX_SPONSOR_APPLICATIONS + 1)

        response = self.client.post(self.url, self.data(sponsor_ids=ids), format='json')

        self.assertEqual(response.status_code, 400)

    def test_email_code_resubmission_creates_the_applications(self):
        RegistrationSettings.objects.update_or_create(
            pk=1, defaults={'email_verification_required': True}
        )
        data = self.data(sponsor_ids=[self.beta.pk])
        self.assertEqual(self.client.post(self.url, data, format='json').status_code, 202)
        code = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

        response = self.client.post(self.url, {**data, 'code': code}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(membership_status(self.driver(), self.beta), PENDING)


class DriverSponsorApiTests(SponsorDataMixin, APITestCase):
    sponsors_url = reverse('driver-sponsors')
    apply_url = reverse('driver-sponsors-apply')
    active_url = reverse('driver-sponsors-active')

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.driver_user = get_user_model().objects.create_user(username='multi.driver')
        cls.driver = create_driver(user=cls.driver_user, name='Multi Driver')
        cls.admin = get_user_model().objects.create_user(username='multi.admin', is_staff=True)
        enroll_totp(cls.admin)

    def setUp(self):
        self.client.force_authenticate(self.driver_user)

    def give_points(self, sponsor, sponsor_user, points):
        PointTransaction.objects.create(
            driver=self.driver, sponsor=sponsor, changed_by_user=sponsor_user,
            point_change=points, reason='Safe driving',
        )

    def switch(self, sponsor_id, client=None):
        return (client or self.client).post(
            self.active_url, {'sponsor_id': sponsor_id}, format='json'
        )

    def test_lists_each_sponsor_with_its_own_balance_and_no_total(self):
        add_membership(self.driver, self.alpha, APPROVED)
        add_membership(self.driver, self.beta, PENDING)
        self.give_points(self.alpha, self.alpha_user, 120)
        self.give_points(self.beta, self.beta_user, 900)

        response = self.client.get(self.sponsors_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {
            'active_sponsor_id': self.alpha.pk,
            'memberships': [
                {'sponsor': {'id': self.alpha.pk, 'name': 'Alpha Freight'},
                 'status': APPROVED, 'point_balance': 120},
                # A pending application shows no balance, even with points on record.
                {'sponsor': {'id': self.beta.pk, 'name': 'Beta Haulers'}, 'status': PENDING},
            ],
        })
        self.assertIn('no-store', response['Cache-Control'])

    def test_sponsor_endpoints_are_for_drivers_only(self):
        for user in (None, self.alpha_user, self.admin):
            self.client.force_authenticate(user)
            self.assertIn(self.client.get(self.sponsors_url).status_code, (401, 403))

    def test_apply_creates_pending_applications(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.apply_url, {'sponsor_ids': [self.alpha.pk, self.beta.pk]}, format='json'
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual([m['status'] for m in response.data['memberships']], [PENDING, PENDING])
        self.assertIsNone(response.data['active_sponsor_id'])
        self.assertTrue(Notification.objects.filter(user=self.alpha_user).exists())

    def test_reapplying_after_a_rejection_reopens_the_same_membership(self):
        membership = add_membership(self.driver, self.alpha, PENDING)
        remove_driver_from_sponsor(driver=self.driver, changed_by_user=self.alpha_user, reason='Incomplete')
        self.assertEqual(membership_status(self.driver, self.alpha), REJECTED)

        response = self.client.post(self.apply_url, {'sponsor_ids': [self.alpha.pk]}, format='json')

        self.assertEqual(response.status_code, 201)
        membership.refresh_from_db()
        self.assertEqual(membership.status, PENDING)
        self.assertEqual(self.driver.memberships.count(), 1)
        self.assertEqual(
            list(DriverStatusChange.objects.filter(driver=self.driver).values_list('action', flat=True)
                 .order_by('pk')),
            [DriverStatusChange.REJECTED, DriverStatusChange.APPLIED],
        )

    def test_an_active_membership_refuses_the_whole_request(self):
        add_membership(self.driver, self.alpha, APPROVED)

        response = self.client.post(
            self.apply_url, {'sponsor_ids': [self.beta.pk, self.alpha.pk]}, format='json'
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(list(response.data['sponsor_ids']), [str(self.alpha.pk)])
        self.assertIsNone(membership_status(self.driver, self.beta))

    def test_apply_needs_at_least_one_sponsor(self):
        for payload in ({}, {'sponsor_ids': []}):
            response = self.client.post(self.apply_url, payload, format='json')
            self.assertEqual(response.status_code, 400)

    def view_as_client(self):
        client = APIClient()
        client.force_login(self.admin)
        session = client.session
        session[IMPERSONATION_TARGET_KEY] = self.driver_user.pk
        session[IMPERSONATION_STARTED_KEY] = timezone.now().isoformat()
        session[IMPERSONATION_ROLE_KEY] = 'driver'
        session.save()
        return client

    def test_view_as_can_switch_but_not_apply(self):
        add_membership(self.driver, self.alpha, APPROVED)
        add_membership(self.driver, self.beta, APPROVED)
        client = self.view_as_client()

        response = client.post(self.apply_url, {'sponsor_ids': [self.closed.pk]}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.switch(self.beta.pk, client).status_code, 200)

    def test_one_approved_sponsor_is_the_default(self):
        add_membership(self.driver, self.beta, APPROVED)
        add_membership(self.driver, self.alpha, PENDING)

        self.assertEqual(self.client.get(self.sponsors_url).data['active_sponsor_id'], self.beta.pk)

    def test_switch_persists_across_requests(self):
        add_membership(self.driver, self.alpha, APPROVED)
        add_membership(self.driver, self.beta, APPROVED)

        response = self.switch(self.beta.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['active_sponsor_id'], self.beta.pk)
        self.assertEqual(self.client.get(self.sponsors_url).data['active_sponsor_id'], self.beta.pk)

    def test_cannot_switch_to_a_sponsor_that_has_not_approved_the_driver(self):
        add_membership(self.driver, self.alpha, APPROVED)
        add_membership(self.driver, self.beta, PENDING)
        add_membership(self.driver, self.closed, REJECTED)

        for sponsor_id in (self.beta.pk, self.closed.pk, self.empty.pk, 999999):
            response = self.switch(sponsor_id)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data['code'], 'sponsor_not_approved')
        self.assertEqual(self.client.get(self.sponsors_url).data['active_sponsor_id'], self.alpha.pk)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_falls_back_when_the_chosen_sponsor_drops_the_driver(self):
        add_membership(self.driver, self.alpha, APPROVED)
        add_membership(self.driver, self.beta, APPROVED)
        self.switch(self.beta.pk)

        remove_driver_from_sponsor(driver=self.driver, changed_by_user=self.beta_user, reason='Left')

        self.assertEqual(self.client.get(self.sponsors_url).data['active_sponsor_id'], self.alpha.pk)


class ViewAsClearsActiveSponsorTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='clear.admin', is_staff=True)
        enroll_totp(cls.admin)
        cls.target = User.objects.create_user(username='clear.driver')
        create_driver(user=cls.target, name='Clear Driver')

    def set_active(self, sponsor_id):
        session = self.client.session
        session[SESSION_KEY] = sponsor_id
        session.save()

    def test_starting_and_stopping_view_as_forget_the_active_sponsor(self):
        self.client.force_login(self.admin)
        self.set_active(1)
        start = reverse('accounts:admin-impersonation-start', args=[self.target.pk])
        self.assertEqual(self.client.post(start).status_code, 200)
        self.assertNotIn(SESSION_KEY, self.client.session)

        self.set_active(1)
        self.client.post(reverse('accounts:admin-impersonation-stop'))
        self.assertNotIn(SESSION_KEY, self.client.session)
