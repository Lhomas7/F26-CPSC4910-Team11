from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from drivers.models import Driver

from ..middleware import IMPERSONATION_STARTED_KEY
from ..models import AdminImpersonationEvent
from ..services.session_state import AUTH_AT_KEY, LAST_ACTIVITY_KEY
from .common import enroll_totp


class ImpersonationLifecycleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='lifecycle.admin', is_staff=True)
        enroll_totp(cls.admin)
        cls.target = User.objects.create_user(username='lifecycle.driver')
        Driver.objects.create(user=cls.target, name='Lifecycle Driver')

    def setUp(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            reverse('accounts:admin-impersonation-start', args=[self.target.pk])
        )
        self.assertEqual(response.status_code, 200)

    def terminal_event(self, action, reason):
        event = AdminImpersonationEvent.objects.exclude(action='start').get()
        self.assertEqual(event.action, action)
        self.assertEqual(event.reason, reason)
        self.assertEqual(event.target_role, 'driver')
        return event

    def test_deleted_target_preserves_audit_role_and_reports_reason(self):
        self.target.delete()

        response = self.client.get(reverse('accounts:me'))

        self.assertEqual(response.json()['user']['impersonation']['code'], 'view_as_target_deleted')
        self.assertIsNone(self.terminal_event('invalidate', 'view_as_target_deleted').target)
        self.client.post(reverse('accounts:admin-impersonation-stop'))
        self.assertEqual(AdminImpersonationEvent.objects.exclude(action='start').count(), 1)

    def test_role_change_is_audited_using_original_target_role(self):
        self.target.is_staff = True
        self.target.save(update_fields=['is_staff'])

        self.client.get(reverse('accounts:me'))

        self.terminal_event('invalidate', 'view_as_invalid_role')

    def test_lost_administrator_privilege_signs_out_and_records_invalidation(self):
        self.admin.is_staff = False
        self.admin.save(update_fields=['is_staff'])

        response = self.client.get(reverse('accounts:me'))

        self.assertEqual(response.status_code, 401)
        self.terminal_event('invalidate', 'view_as_admin_ineligible')

    def test_lost_administrator_mfa_ends_effective_identity(self):
        self.admin.mfa_settings.delete()

        response = self.client.get(reverse('accounts:me'))

        self.assertEqual(response.json()['user']['id'], self.admin.pk)
        self.terminal_event('invalidate', 'view_as_admin_mfa_required')

    def test_deactivated_administrator_is_audited_before_session_is_cleared(self):
        self.admin.is_active = False
        self.admin.save(update_fields=['is_active'])

        response = self.client.get(reverse('accounts:me'))

        self.assertEqual(response.status_code, 401)
        event = self.terminal_event('invalidate', 'view_as_admin_session_ended')
        self.assertEqual(event.admin_id, self.admin.pk)

    def test_administrator_timeout_records_expiration_before_logout(self):
        session = self.client.session
        stale = (timezone.now() - timedelta(days=1)).timestamp()
        session[AUTH_AT_KEY] = stale
        session[LAST_ACTIVITY_KEY] = stale
        session.save()

        response = self.client.get(reverse('accounts:me'))

        self.assertEqual(response.status_code, 401)
        self.terminal_event('expire', 'session_expired')

    def test_expiration_then_stop_creates_only_one_terminal_event(self):
        session = self.client.session
        session[IMPERSONATION_STARTED_KEY] = (timezone.now() - timedelta(hours=1)).isoformat()
        session.save()

        response = self.client.post(reverse('accounts:admin-impersonation-stop'))

        self.assertEqual(response.status_code, 200)
        self.terminal_event('expire', 'view_as_expired')
