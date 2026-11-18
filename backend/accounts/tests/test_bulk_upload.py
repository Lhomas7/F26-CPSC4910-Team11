from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver, PointTransaction

from ..models import Notification, SponsorAccount, SponsorCompany
from .common import InlineThread, enroll_totp

PASSWORD = 'ExamplePassword123!'
User = get_user_model()


def upload(text, name='people.txt'):
    return SimpleUploadedFile(name, text.encode(), content_type='text/plain')


class BulkUploadTestCase(APITestCase):
    url = reverse('accounts:bulk-upload')

    @classmethod
    def setUpTestData(cls):
        cls.company = SponsorCompany.objects.create(name='Palmetto Freight')
        cls.other = SponsorCompany.objects.create(name='Blue Ridge Haulers')
        cls.sponsor = User.objects.create_user('dana.sponsor', password=PASSWORD)
        SponsorAccount.objects.create(user=cls.sponsor, company=cls.company)
        enroll_totp(cls.sponsor)
        cls.admin = User.objects.create_superuser('root.admin', password=PASSWORD)
        enroll_totp(cls.admin)

    def post(self, text, user=None, name='people.txt', **extra):
        self.client.force_authenticate(user or self.sponsor)
        return self.client.post(
            self.url, {'file': upload(text, name), **extra}, format='multipart'
        )

    def make_driver(self, username, email, company=None, status_='approved'):
        user = User.objects.create_user(username, email=email, password=PASSWORD)
        return Driver.objects.create(
            user=user, name=username, sponsor=company, status=status_
        )


class SponsorBulkUploadTests(BulkUploadTestCase):
    def test_creates_drivers_and_sponsors_in_own_organization_accepted_immediately(self):
        text = (
            'Type|Organization|FirstName|LastName|Email|Points|Reason\n'
            '# a comment\n'
            'D||Jane|Doe|jane@example.com|500|Welcome bonus\n'
            'D|palmetto freight|Sam|Smith|sam@example.com\n'
            'S||Pat|Boss|pat@example.com\n'
        )
        with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            with patch('accounts.services.bulk_upload.Thread', InlineThread):
                response = self.post(text)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        summary = response.data['summary']
        self.assertEqual(summary['succeeded'], 3)
        self.assertEqual(summary['failed'], 0)
        self.assertEqual(summary['drivers_created'], 2)
        self.assertEqual(summary['sponsors_created'], 1)
        jane = Driver.objects.get(user__email='jane@example.com')
        self.assertEqual(jane.sponsor, self.company)
        self.assertEqual(jane.status, 'approved')
        self.assertEqual(jane.point_balance, 500)
        self.assertEqual(Driver.objects.get(user__email='sam@example.com').status, 'approved')
        sponsor = SponsorAccount.objects.get(user__email='pat@example.com')
        self.assertEqual(sponsor.company, self.company)
        # Each new person gets an email with a link to choose their own password.
        self.assertEqual(len(mail.outbox), 3)
        self.assertIn('/reset-password/', mail.outbox[0].body)

    def test_cannot_add_people_to_another_organization(self):
        response = self.post(
            'D|Blue Ridge Haulers|Eve|Intruder|eve@example.com\n'
            'S|Brand New Org|Eve|Two|eve2@example.com\n'
        )

        self.assertEqual(response.data['summary']['failed'], 2)
        self.assertFalse(User.objects.filter(email__startswith='eve').exists())
        self.assertEqual(response.data['results'][0]['errors'][0]['field'], 'organization')

    def test_sponsor_cannot_create_organizations(self):
        response = self.post('O|Sneaky Org\n')

        self.assertEqual(response.data['results'][0]['status'], 'error')
        self.assertFalse(SponsorCompany.objects.filter(name='Sneaky Org').exists())

    def test_invalid_lines_are_reported_by_line_and_valid_ones_still_processed(self):
        text = (
            'D||Good|Driver|good@example.com\n'
            'D||Bad1|Name|bad@example.com\n'
            'X||Who|Knows|who@example.com\n'
            'D||No|Email|\n'
            'D||Pts|Bad|pts@example.com|abc\n'
            'D||Too|Many|many@example.com|1|r|extra\n'
            'D||Fine|Driver|fine@example.com|10\n'
        )

        response = self.post(text)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = {r['line']: r for r in response.data['results']}
        self.assertEqual(
            {line: r['status'] for line, r in results.items()},
            {1: 'created', 2: 'error', 3: 'error', 4: 'error', 5: 'error', 6: 'error', 7: 'created'},
        )
        self.assertEqual(results[2]['errors'][0]['field'], 'first_name')
        self.assertIn('Unknown record type', results[3]['message'])
        self.assertEqual(results[4]['errors'][0]['message'], 'Email is required.')
        self.assertEqual(results[5]['errors'][0]['field'], 'points')
        self.assertIn('fields', results[6]['message'])
        self.assertIn('raw', results[2])
        self.assertEqual(response.data['summary']['succeeded'], 2)
        self.assertTrue(User.objects.filter(email='good@example.com').exists())
        self.assertFalse(User.objects.filter(email='bad@example.com').exists())

    def test_row_that_fails_after_starting_is_undone_completely(self):
        # A deduction from a brand new driver cannot be afforded.
        response = self.post('D||New|Person|new@example.com|-50|Penalty\n')

        self.assertEqual(response.data['results'][0]['status'], 'error')
        self.assertFalse(User.objects.filter(email='new@example.com').exists())
        # Counts only include records that were actually kept.
        self.assertEqual(response.data['summary']['drivers_created'], 0)
        self.assertEqual(response.data['summary']['invitations_sent'], 0)

    def test_dry_run_validates_without_creating_anything(self):
        text = 'D||Jane|Doe|jane@example.com|5\nD||Bad1|Name|bad@example.com\n'

        response = self.post(text, dry_run='true')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['dry_run'])
        self.assertEqual(response.data['summary']['succeeded'], 1)
        self.assertEqual(response.data['summary']['failed'], 1)
        self.assertFalse(User.objects.filter(email='jane@example.com').exists())
        self.assertEqual(PointTransaction.objects.count(), 0)

    def test_existing_drivers_get_points_and_pending_ones_are_accepted(self):
        member = self.make_driver('member', 'member@example.com', self.company)
        pending = self.make_driver('pending', 'pending@example.com', self.company, 'pending')
        unassigned = self.make_driver('free', 'free@example.com')
        text = (
            'D||X|Y|member@example.com|250|Great month\n'
            'D||X|Y|pending@example.com|100\n'
            'D||X|Y|free@example.com\n'
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.post(text)

        self.assertEqual(response.data['summary']['failed'], 0, response.data)
        self.assertEqual(member.point_balance, 250)
        self.assertEqual(
            PointTransaction.objects.get(driver=member).reason, 'Great month'
        )
        pending.refresh_from_db()
        self.assertEqual(pending.status, 'approved')
        self.assertEqual(pending.point_balance, 100)
        self.assertEqual(
            PointTransaction.objects.get(driver=pending).reason, 'Bulk upload'
        )
        unassigned.refresh_from_db()
        self.assertEqual((unassigned.sponsor, unassigned.status), (self.company, 'approved'))
        self.assertTrue(
            Notification.objects.filter(
                user=unassigned.user, message__contains='added you'
            ).exists()
        )

    def test_drivers_of_other_organizations_and_non_drivers_cannot_be_taken(self):
        self.make_driver('theirs', 'theirs@example.com', self.other)
        self.sponsor.email = 'dana.sponsor@example.com'
        self.sponsor.save()

        response = self.post(
            'D||A|B|theirs@example.com|10\n'
            'D||A|B|dana.sponsor@example.com\n'
            'S||A|B|theirs@example.com\n'
        )

        self.assertEqual(response.data['summary']['failed'], 3)
        self.assertEqual(Driver.objects.get(user__email='theirs@example.com').sponsor, self.other)
        # The answer does not reveal which organization the driver is in.
        self.assertNotIn('Blue Ridge', response.data['results'][0]['message'])

    def test_csv_upload_adds_drivers(self):
        text = 'First Name,Last Name,Email,Points,Reason\nJane,Doe,jane@example.com,20,Hello\n'

        response = self.post(text, name='drivers.csv')

        self.assertEqual(response.data['format'], 'csv')
        self.assertEqual(response.data['summary']['drivers_created'], 1)
        driver = Driver.objects.get(user__email='jane@example.com')
        self.assertEqual((driver.status, driver.point_balance), ('approved', 20))

    def test_csv_without_required_columns_is_rejected(self):
        response = self.post('Name,Email\nJane,j@example.com\n', name='drivers.csv')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Missing column', response.data['file'][0])

    def test_unusable_files_are_rejected_whole(self):
        for text, name in (('', 'a.txt'), ('# only a comment\n', 'a.txt')):
            with self.subTest(text=text):
                self.assertEqual(self.post(text, name=name).status_code, 400)
        self.client.force_authenticate(self.sponsor)
        binary = SimpleUploadedFile('x.txt', b'\xff\xfe\x00bad')
        self.assertEqual(
            self.client.post(self.url, {'file': binary}, format='multipart').status_code, 400
        )
        self.assertEqual(self.client.post(self.url, {}, format='multipart').status_code, 400)
        too_many = 'D||A|B|a@example.com\n' * 501
        self.assertEqual(self.post(too_many).status_code, 400)

    def test_requires_sponsor_or_admin(self):
        self.client.logout()
        self.assertEqual(
            self.client.post(self.url, {'file': upload('D||A|B|a@b.co')}, format='multipart')
            .status_code,
            status.HTTP_403_FORBIDDEN,
        )
        driver = self.make_driver('plain', 'plain@example.com', self.company)
        self.assertEqual(self.post('D||A|B|a@b.co', user=driver.user).status_code, 403)

    def test_deactivated_sponsor_cannot_upload(self):
        self.sponsor.is_active = False
        self.sponsor.save()
        self.assertEqual(self.post('D||A|B|ab@example.com').status_code, 403)

    def test_generated_usernames_are_unique(self):
        User.objects.create_user('jane', password=PASSWORD)
        self.post('D||Jane|Doe|jane@example.com\nD||Jane|Roe|jane@other.example.com\n')

        names = set(User.objects.filter(first_name='Jane').values_list('username', flat=True))
        self.assertEqual(names, {'jane2', 'jane3'})


class AdminBulkUploadTests(BulkUploadTestCase):
    def test_admin_creates_organizations_then_populates_them_in_one_upload(self):
        text = (
            'O|Fresh Org\n'
            'S|Fresh Org|Sue|Boss|sue@example.com\n'
            'D|Fresh Org|Dan|Driver|dan@example.com|75|Signup\n'
            'D|Blue Ridge Haulers|Bo|Driver|bo@example.com\n'
            'O|Blue Ridge Haulers\n'
        )

        response = self.post(text, user=self.admin)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data['summary']
        self.assertEqual((summary['failed'], summary['succeeded']), (0, 5))
        self.assertEqual(summary['organizations_created'], 1)
        fresh = SponsorCompany.objects.get(name='Fresh Org')
        self.assertEqual(SponsorAccount.objects.get(user__email='sue@example.com').company, fresh)
        dan = Driver.objects.get(user__email='dan@example.com')
        self.assertEqual((dan.sponsor, dan.status, dan.point_balance), (fresh, 'approved', 75))
        self.assertEqual(PointTransaction.objects.get(driver=dan).changed_by_user, self.admin)
        self.assertEqual(response.data['results'][4]['status'], 'unchanged')

    def test_unknown_organization_is_an_error_for_admins(self):
        response = self.post('D|Nowhere Inc|A|B|ab@example.com\nD||A|B|cd@example.com\n', user=self.admin)

        self.assertEqual(response.data['summary']['failed'], 2)
        self.assertIn('O line', response.data['results'][0]['message'])

    def test_organization_lines_reject_extra_columns(self):
        response = self.post('O|Some Org||x\n', user=self.admin)
        self.assertEqual(response.data['results'][0]['status'], 'error')
        self.assertFalse(SponsorCompany.objects.filter(name='Some Org').exists())

    def test_admin_cannot_move_a_driver_between_organizations(self):
        self.make_driver('theirs', 'theirs@example.com', self.other)
        response = self.post('D|Palmetto Freight|A|B|theirs@example.com\n', user=self.admin)
        self.assertIn('Blue Ridge Haulers', response.data['results'][0]['message'])

    def test_admin_points_for_any_organization(self):
        driver = self.make_driver('theirs', 'theirs@example.com', self.other)
        self.post('D|Blue Ridge Haulers|A|B|theirs@example.com|40|Bonus\n', user=self.admin)
        self.assertEqual(driver.point_balance, 40)
        self.assertEqual(PointTransaction.objects.get(driver=driver).sponsor, self.other)
