from django.contrib.auth import get_user_model
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from drivers.models import Driver

from ..middleware import (
    IMPERSONATION_ROLE_KEY,
    IMPERSONATION_STARTED_KEY,
    IMPERSONATION_TARGET_KEY,
)
from ..models import Notification, SponsorAccount, SponsorCompany
from ..services.delivery import send_email_code
from ..services.notify import notify_unrecognized_sign_in
from .common import enroll_totp


class NotificationCenterTests(APITestCase):
    list_url = reverse('accounts:notifications')
    read_url = reverse('accounts:notifications-read')
    clear_url = reverse('accounts:notifications-clear')

    @staticmethod
    def detail_url(notification):
        return reverse('accounts:notification-detail', kwargs={'notification_id': notification.pk})

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.driver_user = User.objects.create_user(
            username='driver.one', password='ExamplePassword123!', email='driver@example.com'
        )
        cls.driver = Driver.objects.create(
            user=cls.driver_user, name='Driver One', sponsor=cls.company, status='approved'
        )
        cls.other_user = User.objects.create_user(
            username='driver.two', password='ExamplePassword123!'
        )
        Driver.objects.create(user=cls.other_user, name='Driver Two')
        cls.sponsor = User.objects.create_user(
            username='sponsor.one', password='ExamplePassword123!'
        )
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        cls.admin = User.objects.create_superuser(
            username='admin.one', password='ExamplePassword123!'
        )
        for user in (cls.sponsor, cls.admin):
            enroll_totp(user)

    def notify(self, user, message, **fields):
        return Notification.objects.create(
            user=user, category=Notification.SECURITY, message=message, **fields
        )

    def test_lists_only_own_alerts_newest_first_with_unread_count(self):
        self.notify(self.driver_user, 'First', read=True)
        self.notify(self.driver_user, 'Second')
        self.notify(self.other_user, 'Not yours')
        self.client.force_authenticate(self.driver_user)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([n['message'] for n in response.data['results']], ['Second', 'First'])
        self.assertEqual(response.data['unread_count'], 1)

    def test_sponsors_have_a_notification_center_too(self):
        self.notify(self.sponsor, 'Sponsor alert')
        self.client.force_authenticate(self.sponsor)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['unread_count'], 1)

    def test_limit_is_capped(self):
        for index in range(60):
            self.notify(self.driver_user, f'Alert {index}')
        self.client.force_authenticate(self.driver_user)

        self.assertEqual(len(self.client.get(self.list_url).data['results']), 50)
        self.assertEqual(len(self.client.get(self.list_url, {'limit': 5}).data['results']), 5)
        self.assertEqual(len(self.client.get(self.list_url, {'limit': 'x'}).data['results']), 50)

    def test_mark_all_read(self):
        self.notify(self.driver_user, 'One')
        self.notify(self.driver_user, 'Two')
        self.client.force_authenticate(self.driver_user)

        response = self.client.post(self.read_url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['unread_count'], 0)
        self.assertFalse(Notification.objects.filter(read=False).exists())

    def test_mark_some_read_never_touches_another_users_alerts(self):
        mine = self.notify(self.driver_user, 'Mine')
        keep = self.notify(self.driver_user, 'Keep unread')
        theirs = self.notify(self.other_user, 'Theirs')
        self.client.force_authenticate(self.driver_user)

        response = self.client.post(self.read_url, {'ids': [mine.pk, theirs.pk]}, format='json')

        self.assertEqual(response.data['unread_count'], 1)
        mine.refresh_from_db()
        keep.refresh_from_db()
        theirs.refresh_from_db()
        self.assertTrue(mine.read)
        self.assertFalse(keep.read)
        self.assertFalse(theirs.read)

    def test_admins_and_anonymous_callers_are_refused(self):
        self.assertIn(
            self.client.get(self.list_url).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(self.read_url, {}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_view_as_can_read_but_not_change_alerts(self):
        alert = self.notify(self.driver_user, 'Unread')
        client = APIClient()
        client.force_login(self.admin)
        session = client.session
        session[IMPERSONATION_TARGET_KEY] = self.driver_user.pk
        session[IMPERSONATION_STARTED_KEY] = timezone.now().isoformat()
        session[IMPERSONATION_ROLE_KEY] = 'driver'
        session.save()

        self.assertEqual(client.get(self.list_url).data['unread_count'], 1)
        for response in (
            client.post(self.read_url, {}, format='json'),
            client.post(self.clear_url, {}, format='json'),
            client.delete(self.detail_url(alert)),
        ):
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        alert.refresh_from_db()
        self.assertFalse(alert.read)

    def test_clear_one_of_your_own_alerts(self):
        mine = self.notify(self.driver_user, 'Mine')
        keep = self.notify(self.driver_user, 'Keep')
        self.client.force_authenticate(self.driver_user)

        response = self.client.delete(self.detail_url(mine))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(list(Notification.objects.filter(user=self.driver_user)), [keep])

    def test_cannot_clear_another_users_alert(self):
        theirs = self.notify(self.other_user, 'Theirs')
        self.client.force_authenticate(self.driver_user)

        response = self.client.delete(self.detail_url(theirs))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Notification.objects.filter(pk=theirs.pk).exists())

    def test_clear_all_only_clears_your_own_alerts(self):
        self.notify(self.driver_user, 'One')
        self.notify(self.driver_user, 'Two')
        theirs = self.notify(self.other_user, 'Theirs')
        self.client.force_authenticate(self.driver_user)

        response = self.client.post(self.clear_url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'results': [], 'unread_count': 0})
        self.assertEqual(list(Notification.objects.all()), [theirs])

    def test_verification_codes_never_reach_the_notification_center(self):
        send_email_code(self.driver_user, '123456')

        self.assertEqual(len(mail.outbox), 1)
        self.assertFalse(Notification.objects.exists())

    def test_security_notices_are_recorded_for_sponsors(self):
        notify_unrecognized_sign_in(self.sponsor)

        notification = Notification.objects.get(user=self.sponsor)
        self.assertEqual(notification.category, Notification.SECURITY)

    def test_messages_are_returned_as_literal_text(self):
        self.notify(self.driver_user, '<script>alert(1)</script>')
        self.client.force_authenticate(self.driver_user)

        response = self.client.get(self.list_url)

        self.assertEqual(response.data['results'][0]['message'], '<script>alert(1)</script>')
