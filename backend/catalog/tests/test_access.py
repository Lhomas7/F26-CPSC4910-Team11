from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.http import JsonResponse
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from accounts.middleware import (
    IMPERSONATION_ROLE_KEY,
    IMPERSONATION_STARTED_KEY,
    IMPERSONATION_TARGET_KEY,
    AdminImpersonationMiddleware,
)
from accounts.models import MFASettings, SponsorAccount, SponsorCompany
from accounts.permissions import MFAEnrolled
from catalog.services import driver_catalog_scope, sponsor_catalog_scope
from drivers.models import Driver


class CatalogAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Catalog Company')
        cls.other_company = SponsorCompany.objects.create(name='Other Company')
        # Passwords are not used: these tests exercise service authorization,
        # not authentication or password hashing.
        cls.sponsor = User.objects.create_user(username='catalog.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        MFASettings.objects.create(user=cls.sponsor, totp_enabled=True)
        cls.driver_user = User.objects.create_user(username='catalog.driver')
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Catalog Driver', sponsor=cls.company,
            status='approved',
        )
        cls.other_user = User.objects.create_user(username='catalog.other')
        cls.other_driver = Driver.objects.create(
            user=cls.other_user, name='Other Driver', sponsor=cls.other_company,
            status='approved',
        )
        cls.admin = User.objects.create_user(username='catalog.admin', is_staff=True)
        MFASettings.objects.create(user=cls.admin, totp_enabled=True)

    def test_sponsor_scope_comes_from_account_relationship(self):
        scope = sponsor_catalog_scope(self.sponsor)
        self.assertEqual(scope.company_id, self.company.pk)
        self.assertIsNone(scope.driver_id)

    def test_driver_scope_comes_from_driver_relationship(self):
        scope = driver_catalog_scope(self.driver_user)
        self.assertEqual(scope.company_id, self.company.pk)
        self.assertEqual(scope.driver_id, self.driver.pk)
        self.assertEqual(scope.driver_status, 'approved')

    def test_scopes_exclude_other_organizations_before_lookup(self):
        # Use an existing sponsor-owned model until catalog products are defined.
        for scope in (sponsor_catalog_scope(self.sponsor), driver_catalog_scope(self.driver_user)):
            with self.subTest(scope=scope):
                scoped = scope.restrict(Driver.objects.all())
                self.assertEqual(list(scoped.values_list('pk', flat=True)), [self.driver.pk])
                with self.assertRaises(Driver.DoesNotExist):
                    scoped.get(pk=self.other_driver.pk)

    def test_other_company_driver_resolves_its_own_scope(self):
        self.assertEqual(driver_catalog_scope(self.other_user).company_id, self.other_company.pk)

    def test_anonymous_callers_are_refused(self):
        for resolver in (sponsor_catalog_scope, driver_catalog_scope):
            for user in (None, AnonymousUser()):
                with self.subTest(resolver=resolver, user=user):
                    with self.assertRaises(NotAuthenticated):
                        resolver(user)

    def test_wrong_roles_and_accounts_without_profiles_are_refused(self):
        unassigned_role = get_user_model().objects.create_user(username='catalog.no.role')
        cases = (
            (sponsor_catalog_scope, self.driver_user),
            (driver_catalog_scope, self.sponsor),
            (sponsor_catalog_scope, self.admin),
            (driver_catalog_scope, self.admin),
            (sponsor_catalog_scope, unassigned_role),
            (driver_catalog_scope, unassigned_role),
        )
        for resolver, user in cases:
            with self.subTest(resolver=resolver, user=user):
                with self.assertRaises(PermissionDenied):
                    resolver(user)

    def test_staff_with_sponsor_relationship_is_still_refused(self):
        SponsorAccount.objects.create(user=self.admin, company=self.company)
        with self.assertRaises(PermissionDenied):
            sponsor_catalog_scope(self.admin)

    def test_inactive_accounts_are_refused(self):
        for resolver, user in (
            (sponsor_catalog_scope, self.sponsor), (driver_catalog_scope, self.driver_user),
        ):
            user.is_active = False
            with self.subTest(user=user):
                with self.assertRaises(PermissionDenied) as error:
                    resolver(user)
                self.assertEqual(error.exception.get_codes(), 'inactive_account')

    def test_sponsor_must_satisfy_existing_mfa_policy(self):
        MFASettings.objects.filter(user=self.sponsor).delete()
        user = get_user_model().objects.get(pk=self.sponsor.pk)
        with self.assertRaisesMessage(PermissionDenied, MFAEnrolled.message):
            sponsor_catalog_scope(user)

    def test_driver_must_satisfy_company_mfa_policy(self):
        SponsorCompany.objects.filter(pk=self.company.pk).update(driver_mfa_required=True)
        user = get_user_model().objects.get(pk=self.driver_user.pk)
        with self.assertRaises(PermissionDenied):
            driver_catalog_scope(user)
        MFASettings.objects.create(user=user, email_enabled=True)
        user = get_user_model().objects.get(pk=user.pk)
        self.assertEqual(driver_catalog_scope(user).company_id, self.company.pk)

    def test_driver_without_sponsor_has_explicit_missing_relationship_error(self):
        Driver.objects.filter(pk=self.driver.pk).update(sponsor=None)
        user = get_user_model().objects.get(pk=self.driver_user.pk)
        with self.assertRaises(PermissionDenied) as error:
            driver_catalog_scope(user)
        self.assertEqual(error.exception.get_codes(), 'sponsor_required')

    def test_pending_status_is_preserved_without_deciding_browsing_policy(self):
        Driver.objects.filter(pk=self.driver.pk).update(status='pending')
        user = get_user_model().objects.get(pk=self.driver_user.pk)
        self.assertEqual(driver_catalog_scope(user).driver_status, 'pending')

    def test_view_as_uses_effective_target_scope_for_both_roles(self):
        for target, role, resolver in (
            (self.driver_user, 'driver', driver_catalog_scope),
            (self.sponsor, 'sponsor', sponsor_catalog_scope),
        ):
            with self.subTest(role=role):
                request = RequestFactory().get('/api/catalog/')
                request.user = self.admin
                request.session = {
                    IMPERSONATION_TARGET_KEY: target.pk,
                    IMPERSONATION_STARTED_KEY: timezone.now().isoformat(),
                    IMPERSONATION_ROLE_KEY: role,
                }
                resolved = []

                def response_for(effective_request):
                    resolved.append(resolver(effective_request.user))
                    return JsonResponse({})

                response = AdminImpersonationMiddleware(response_for)(request)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(resolved), 1)
                self.assertEqual(resolved[0].company_id, self.company.pk)
                self.assertEqual(request.real_user.pk, self.admin.pk)
                self.assertEqual(request.user.pk, target.pk)
