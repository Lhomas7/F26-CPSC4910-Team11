from django.contrib.auth import get_user_model
from django.test import TestCase

from drivers.models import Driver

from ..models import SponsorAccount, SponsorCompany
from ..serializers.admin_users import AdminDriverDetailSerializer, AdminSponsorDetailSerializer
from .common import enroll_totp


class ViewAsEligibilityResponseTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Eligibility Freight')
        cls.driver = User.objects.create_user(username='eligible.driver')
        Driver.objects.create(user=cls.driver, name='Eligible Driver', sponsor=cls.company)
        cls.sponsor = User.objects.create_user(username='eligible.sponsor')
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)

    def test_optional_mfa_driver_has_eligible_metadata(self):
        data = AdminDriverDetailSerializer(self.driver).data

        self.assertEqual(data['view_as'], {'eligible': True, 'code': None, 'detail': None})

    def test_sponsor_metadata_changes_after_required_mfa_enrollment(self):
        blocked = AdminSponsorDetailSerializer(self.sponsor).data['view_as']
        self.assertFalse(blocked['eligible'])
        self.assertEqual(blocked['code'], 'view_as_target_mfa_required')

        enroll_totp(self.sponsor)
        # A new instance mirrors a new detail request without cached relations.
        user = get_user_model().objects.get(pk=self.sponsor.pk)
        self.assertTrue(AdminSponsorDetailSerializer(user).data['view_as']['eligible'])

    def test_driver_metadata_reflects_organization_mfa_policy(self):
        self.company.driver_mfa_required = True
        self.company.save(update_fields=['driver_mfa_required'])
        user = get_user_model().objects.get(pk=self.driver.pk)

        data = AdminDriverDetailSerializer(user).data['view_as']

        self.assertFalse(data['eligible'])
        self.assertEqual(data['code'], 'view_as_target_mfa_required')
