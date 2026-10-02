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

from .common import enroll_totp

class AdminUserListTests(APITestCase):
    url = reverse('accounts:admin-user-list')

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.admin = get_user_model().objects.create_superuser(
            username='directory.admin',
            password='ExamplePassword123!',
            first_name='Directory',
            last_name='Admin',
        )
        enroll_totp(cls.admin)
        cls.driver_user = get_user_model().objects.create_user(
            username='marcus.driver',
            password='ExamplePassword123!',
        )
        Driver.objects.create(
            user=cls.driver_user,
            name='Marcus Alvarez',
            sponsor=cls.company,
            status='approved',
        )
        cls.sponsor_user = get_user_model().objects.create_user(
            username='dana.sponsor',
            password='ExamplePassword123!',
            first_name='Dana',
            last_name='Whitfield',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.orphan = get_user_model().objects.create_user(username='orphan.user')

    def test_only_admins_can_list_users(self):
        anonymous_response = self.client.get(self.url)
        self.client.force_authenticate(self.driver_user)
        driver_response = self.client.get(self.url)

        self.assertEqual(anonymous_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(driver_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_returns_each_application_role_and_excludes_orphans(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([user['display_name'] for user in response.data], [
            'Dana Whitfield', 'Directory Admin', 'Marcus Alvarez'
        ])
        driver = next(user for user in response.data if user['role'] == 'driver')
        self.assertEqual(driver['display_name'], 'Marcus Alvarez')
        self.assertEqual(driver['sponsor_org']['name'], 'Palmetto Freight')
        self.assertNotIn('orphan.user', [user['username'] for user in response.data])

    def test_filters_by_role_and_searches_name_or_username(self):
        self.client.force_authenticate(self.admin)

        role_response = self.client.get(self.url, {'role': 'sponsor'})
        search_response = self.client.get(self.url, {'search': 'marcus'})

        self.assertEqual([user['username'] for user in role_response.data], [
            'dana.sponsor'
        ])
        self.assertEqual([user['username'] for user in search_response.data], [
            'marcus.driver'
        ])

    def test_rejects_an_unknown_role_filter(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url, {'role': 'owner'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)


class AdminUserCreationTests(APITestCase):
    user_url = reverse('accounts:admin-user-list')
    company_url = reverse('accounts:admin-sponsor-company-list')

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.admin = get_user_model().objects.create_superuser(
            username='creator.admin',
            password='ExamplePassword123!',
        )
        enroll_totp(cls.admin)
        cls.driver_user = get_user_model().objects.create_user(
            username='ordinary.driver',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=cls.driver_user, name='Ordinary Driver')

    def payload(self, **overrides):
        data = {
            'first_name': 'Jamie',
            'last_name': 'Rivera',
            'username': 'jamie.rivera',
            'email': 'jamie@example.com',
            'role': 'driver',
            'sponsor_org_id': self.company.id,
            'password': 'ExamplePassword123!',
            'password_confirm': 'ExamplePassword123!',
        }
        data.update(overrides)
        return data

    def test_only_admins_can_load_companies_or_create_users(self):
        self.client.force_authenticate(self.driver_user)

        company_response = self.client.get(self.company_url)
        create_response = self.client.post(
            self.user_url,
            self.payload(),
            format='json',
        )

        self.assertEqual(company_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_lists_sponsor_companies_alphabetically(self):
        SponsorCompany.objects.create(name='Blue Ridge Logistics')
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.company_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([company['name'] for company in response.data], [
            'Blue Ridge Logistics', 'Palmetto Freight'
        ])

    def test_creates_driver_with_optional_sponsor(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(self.user_url, self.payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='jamie.rivera')
        self.assertEqual(user.driver_profile.name, 'Jamie Rivera')
        self.assertEqual(user.driver_profile.sponsor, self.company)
        self.assertEqual(response.data['role'], 'driver')

    def test_creates_sponsor_with_required_organization(self):
        self.client.force_authenticate(self.admin)
        data = self.payload(
            username='sponsor.user',
            email='sponsor@example.com',
            role='sponsor',
        )

        response = self.client.post(self.user_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='sponsor.user')
        self.assertEqual(user.sponsor_account.company, self.company)
        self.assertEqual(response.data['sponsor_org']['name'], 'Palmetto Freight')

    def test_creates_staff_superuser_for_admin_role(self):
        self.client.force_authenticate(self.admin)
        data = self.payload(
            username='new.admin',
            email='new.admin@example.com',
            role='admin',
            sponsor_org_id=None,
        )

        response = self.client.post(self.user_url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = get_user_model().objects.get(username='new.admin')
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(response.data['role'], 'admin')

    def test_rejects_duplicate_username_and_email_case_insensitively(self):
        get_user_model().objects.create_user(
            username='existing.user',
            email='existing@example.com',
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            self.user_url,
            self.payload(
                username='EXISTING.USER',
                email='EXISTING@EXAMPLE.COM',
            ),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)

    def test_requires_an_organization_for_sponsor_accounts(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            self.user_url,
            self.payload(
                username='sponsor.without.org',
                email='sponsor.without.org@example.com',
                role='sponsor',
                sponsor_org_id=None,
            ),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sponsor_org_id', response.data)


class AdminAccountDetailTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(
            username='admin.manager',
            password='ExamplePassword123!',
            email='manager@example.com',
        )
        cls.other_admin = get_user_model().objects.create_superuser(
            username='other.admin',
            password='ExamplePassword123!',
            first_name='Other',
            last_name='Administrator',
            email='other@example.com',
        )
        cls.driver_user = get_user_model().objects.create_user(
            username='ordinary.driver',
            password='ExamplePassword123!',
        )
        Driver.objects.create(user=cls.driver_user, name='Ordinary Driver')

    def detail_url(self, user=None):
        return reverse(
            'accounts:admin-account-detail',
            kwargs={'user_id': (user or self.other_admin).id},
        )

    def test_admin_can_review_another_admin(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'admin')
        self.assertEqual(response.data['email'], 'other@example.com')

    def test_admin_can_update_another_admin_identity_and_status(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'first_name': 'Updated',
            'last_name': 'Administrator',
            'username': 'updated.admin',
            'email': 'updated@example.com',
            'is_active': False,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.other_admin.refresh_from_db()
        self.assertEqual(self.other_admin.first_name, 'Updated')
        self.assertEqual(self.other_admin.username, 'updated.admin')
        self.assertFalse(self.other_admin.is_active)
        self.assertTrue(self.other_admin.is_staff)
        self.assertTrue(self.other_admin.is_superuser)

    def test_admin_cannot_use_other_admin_route_on_self(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.detail_url(self.admin),
            {'is_active': False},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_non_admin_cannot_review_or_update_admin(self):
        self.client.force_authenticate(self.driver_user)

        get_response = self.client.get(self.detail_url())
        patch_response = self.client.patch(
            self.detail_url(),
            {'first_name': 'Changed'},
            format='json',
        )

        self.assertEqual(get_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rejects_duplicate_admin_identity_fields(self):
        get_user_model().objects.create_user(
            username='existing.user',
            email='existing@example.com',
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'username': 'EXISTING.USER',
            'email': 'EXISTING@EXAMPLE.COM',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)


class AdminSponsorDetailTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other_company = SponsorCompany.objects.create(name='Blue Ridge Logistics')
        cls.admin = get_user_model().objects.create_superuser(
            username='sponsor.manager', password='ExamplePassword123!'
        )
        enroll_totp(cls.admin)
        cls.sponsor_user = get_user_model().objects.create_user(
            username='dana.sponsor',
            password='ExamplePassword123!',
            first_name='Dana',
            last_name='Whitfield',
            email='dana@example.com',
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)
        cls.driver_user = get_user_model().objects.create_user(
            username='ordinary.driver', password='ExamplePassword123!'
        )
        Driver.objects.create(user=cls.driver_user, name='Ordinary Driver')

    def detail_url(self, user=None):
        return reverse(
            'accounts:admin-sponsor-detail',
            kwargs={'user_id': (user or self.sponsor_user).id},
        )

    def test_admin_can_load_sponsor_details(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'sponsor')
        self.assertEqual(response.data['sponsor_org']['name'], 'Palmetto Freight')
        self.assertEqual(response.data['email'], 'dana@example.com')

    def test_non_admin_cannot_view_or_edit_sponsor(self):
        self.client.force_authenticate(self.driver_user)

        get_response = self.client.get(self.detail_url())
        patch_response = self.client.patch(
            self.detail_url(), {'first_name': 'Changed'}, format='json'
        )

        self.assertEqual(get_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_driver_id_is_not_exposed_as_a_sponsor_detail(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url(self.driver_user))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_update_sponsor_identity_company_and_status(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'first_name': 'Danielle',
            'last_name': 'Whitfield',
            'username': 'danielle.sponsor',
            'email': 'danielle@example.com',
            'sponsor_org_id': self.other_company.id,
            'is_active': False,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.sponsor_user.refresh_from_db()
        self.sponsor_user.sponsor_account.refresh_from_db()
        self.assertEqual(self.sponsor_user.first_name, 'Danielle')
        self.assertEqual(self.sponsor_user.sponsor_account.company, self.other_company)
        self.assertFalse(self.sponsor_user.is_active)

    def test_rejects_duplicate_username_and_email(self):
        get_user_model().objects.create_user(
            username='existing.user', email='existing@example.com'
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'username': 'EXISTING.USER',
            'email': 'EXISTING@EXAMPLE.COM',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)


class AdminDriverDetailTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other_company = SponsorCompany.objects.create(name='Blue Ridge Logistics')
        cls.admin = get_user_model().objects.create_superuser(
            username='driver.manager', password='ExamplePassword123!'
        )
        enroll_totp(cls.admin)
        cls.driver_user = get_user_model().objects.create_user(
            username='tasha.driver',
            password='ExamplePassword123!',
            email='tasha@example.com',
        )
        Driver.objects.create(
            user=cls.driver_user,
            name='Tasha Greene',
            sponsor=cls.company,
            status='approved',
        )
        cls.sponsor_user = get_user_model().objects.create_user(
            username='ordinary.sponsor', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor_user, company=cls.company)

    def detail_url(self, user=None):
        return reverse(
            'accounts:admin-driver-detail',
            kwargs={'user_id': (user or self.driver_user).id},
        )

    def test_admin_can_load_driver_details(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['display_name'], 'Tasha Greene')
        self.assertEqual(response.data['role'], 'driver')
        self.assertEqual(response.data['sponsor_org']['name'], 'Palmetto Freight')
        self.assertIsNone(response.data['profile_picture_url'])

    def test_non_admin_cannot_view_or_edit_driver(self):
        self.client.force_authenticate(self.sponsor_user)

        get_response = self.client.get(self.detail_url())
        patch_response = self.client.patch(
            self.detail_url(), {'display_name': 'Changed'}, format='json'
        )

        self.assertEqual(get_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sponsor_id_is_not_exposed_as_driver_detail(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.detail_url(self.sponsor_user))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_update_driver_and_remove_sponsor(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'display_name': 'Tasha Green',
            'username': 'tasha.green',
            'email': 'tasha.green@example.com',
            'sponsor_org_id': None,
            'is_active': False,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.driver_user.refresh_from_db()
        self.driver_user.driver_profile.refresh_from_db()
        self.assertEqual(self.driver_user.driver_profile.name, 'Tasha Green')
        self.assertIsNone(self.driver_user.driver_profile.sponsor)
        self.assertFalse(self.driver_user.is_active)

    def test_admin_can_reassign_driver_to_another_sponsor(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.detail_url(),
            {'sponsor_org_id': self.other_company.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sponsor_org']['name'], 'Blue Ridge Logistics')

    def test_rejects_invalid_or_duplicate_identity_fields(self):
        get_user_model().objects.create_user(
            username='existing.user', email='existing@example.com'
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.detail_url(), {
            'display_name': '   ',
            'username': 'EXISTING.USER',
            'email': 'EXISTING@EXAMPLE.COM',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('display_name', response.data)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)


class AdminImpersonationTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username='admin.viewer',
            password='ExamplePassword123!',
            first_name='Avery',
            last_name='Admin',
            is_staff=True,
        )
        self.driver_user = User.objects.create_user(
            username='driver.target',
            password='ExamplePassword123!',
            email='driver@example.com',
        )
        Driver.objects.create(user=self.driver_user, name='Drew Driver')
        self.company = SponsorCompany.objects.create(name='Palmetto Freight')
        self.sponsor_user = User.objects.create_user(
            username='sponsor.target',
            password='ExamplePassword123!',
            first_name='Sam',
            last_name='Sponsor',
        )
        SponsorAccount.objects.create(user=self.sponsor_user, company=self.company)
        self.client.login(username='admin.viewer', password='ExamplePassword123!')

    def start(self, user):
        return self.client.post(
            reverse('accounts:admin-impersonation-start', args=[user.id]),
            {},
            format='json',
        )

    def test_admin_can_view_as_driver_then_return_to_admin(self):
        started = self.start(self.driver_user)

        self.assertEqual(started.status_code, status.HTTP_200_OK)
        self.assertEqual(started.data['account_type'], 'driver')
        self.assertTrue(started.data['impersonation']['active'])
        self.assertEqual(self.client.get(reverse('accounts:me')).data['user']['id'], self.driver_user.id)

        stopped = self.client.post(reverse('accounts:admin-impersonation-stop'))
        self.assertEqual(stopped.status_code, status.HTTP_200_OK)
        self.assertEqual(stopped.data['id'], self.admin.id)
        self.assertEqual(stopped.data['account_type'], 'admin')
        self.assertEqual(
            list(AdminImpersonationEvent.objects.values_list('action', flat=True).order_by('created_at')),
            ['start', 'stop'],
        )

    def test_admin_can_view_as_sponsor(self):
        response = self.start(self.sponsor_user)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['account_type'], 'sponsor')
        self.assertEqual(response.data['company'], self.company.name)

    def test_non_admin_and_invalid_targets_are_rejected(self):
        other_admin = get_user_model().objects.create_user(
            username='other.admin',
            password='ExamplePassword123!',
            is_staff=True,
        )
        self.assertEqual(self.start(other_admin).status_code, status.HTTP_400_BAD_REQUEST)
        self.driver_user.is_active = False
        self.driver_user.save(update_fields=['is_active'])
        self.assertEqual(self.start(self.driver_user).status_code, status.HTTP_400_BAD_REQUEST)

        self.client.logout()
        self.client.login(username='sponsor.target', password='ExamplePassword123!')
        self.assertEqual(self.start(self.driver_user).status_code, status.HTTP_403_FORBIDDEN)

    def test_sensitive_account_mutations_are_blocked_while_viewing_as(self):
        self.start(self.driver_user)

        response = self.client.post(
            reverse('accounts:change-password'),
            {'password': 'AnotherPassword123!', 'password_confirm': 'AnotherPassword123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.driver_user.refresh_from_db()
        self.assertTrue(self.driver_user.check_password('ExamplePassword123!'))

    def test_expired_session_returns_to_admin_and_is_audited(self):
        self.start(self.driver_user)
        session = self.client.session
        session[IMPERSONATION_STARTED_KEY] = (timezone.now() - timedelta(hours=1)).isoformat()
        session.save()

        response = self.client.get(reverse('accounts:me'))

        self.assertEqual(response.data['user']['id'], self.admin.id)
        self.assertTrue(
            AdminImpersonationEvent.objects.filter(action='expire', target=self.driver_user).exists()
        )

