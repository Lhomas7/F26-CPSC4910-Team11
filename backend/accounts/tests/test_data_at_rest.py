from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from drivers.models import Driver

from ..fields import CIPHERTEXT_PREFIX
from ..models import MFASettings

PASSWORD = 'ExamplePassword123!'
NUMBER = '+18645550123'


def raw_column(table, column, pk):
    """Read a value straight from the database, bypassing the ORM's decryption."""
    with connection.cursor() as cursor:
        cursor.execute(f'SELECT {column} FROM {table} WHERE id = %s', [pk])
        return cursor.fetchone()[0]


class PasswordStorageTests(TestCase):
    def test_passwords_are_hashed_with_a_slow_algorithm(self):
        user = get_user_model().objects.create_user(username='hash.one', password=PASSWORD)

        self.assertEqual(
            settings.PASSWORD_HASHERS[0], 'django.contrib.auth.hashers.PBKDF2PasswordHasher'
        )
        algorithm, iterations, _salt, _digest = user.password.split('$')
        self.assertEqual(algorithm, 'pbkdf2_sha256')
        self.assertGreaterEqual(int(iterations), 600_000)
        self.assertNotIn(PASSWORD, raw_column('auth_user', 'password', user.pk))

    def test_every_password_gets_its_own_salt(self):
        User = get_user_model()
        first = User.objects.create_user(username='salt.one', password=PASSWORD)
        second = User.objects.create_user(username='salt.two', password=PASSWORD)

        first_salt = first.password.split('$')[2]
        second_salt = second.password.split('$')[2]

        self.assertGreaterEqual(len(first_salt), 16)
        self.assertNotEqual(first_salt, second_salt)
        # Same password, different hash: no one can spot shared passwords.
        self.assertNotEqual(first.password, second.password)
        self.assertTrue(first.check_password(PASSWORD))
        self.assertFalse(first.check_password('SomethingElse123!'))

    def test_changing_a_password_re_salts_it(self):
        user = get_user_model().objects.create_user(username='salt.three', password=PASSWORD)
        old_salt = user.password.split('$')[2]

        user.set_password(PASSWORD)

        self.assertNotEqual(user.password.split('$')[2], old_salt)


class EncryptedPhoneNumberTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username='enc.driver', password=PASSWORD)
        self.driver = Driver.objects.create(user=user, name='Enc Driver', phone_number=NUMBER)

    def test_driver_phone_number_is_ciphertext_in_the_database(self):
        stored = raw_column('drivers_driver', 'phone_number', self.driver.pk)

        self.assertTrue(stored.startswith(CIPHERTEXT_PREFIX))
        self.assertNotIn('864', stored)

        self.driver.refresh_from_db()
        self.assertEqual(self.driver.phone_number, NUMBER)

    def test_mfa_phone_number_is_ciphertext_in_the_database(self):
        mfa = MFASettings.objects.create(user=self.driver.user, phone_number=NUMBER)

        stored = raw_column('accounts_mfasettings', 'phone_number', mfa.pk)

        self.assertTrue(stored.startswith(CIPHERTEXT_PREFIX))
        mfa.refresh_from_db()
        self.assertEqual(mfa.phone_number, NUMBER)

    def test_the_same_number_is_encrypted_differently_each_time(self):
        first = raw_column('drivers_driver', 'phone_number', self.driver.pk)
        self.driver.save(update_fields=['phone_number'])

        self.assertNotEqual(first, raw_column('drivers_driver', 'phone_number', self.driver.pk))

    def test_blank_and_null_stay_unencrypted(self):
        self.driver.phone_number = ''
        self.driver.save(update_fields=['phone_number'])
        mfa = MFASettings.objects.create(user=self.driver.user)

        self.assertEqual(raw_column('drivers_driver', 'phone_number', self.driver.pk), '')
        self.assertIsNone(raw_column('accounts_mfasettings', 'phone_number', mfa.pk))

    def test_plaintext_left_over_from_before_encryption_still_reads(self):
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE drivers_driver SET phone_number = %s WHERE id = %s',
                [NUMBER, self.driver.pk],
            )

        self.driver.refresh_from_db()

        self.assertEqual(self.driver.phone_number, NUMBER)

    def test_the_wrong_key_fails_loudly_instead_of_returning_ciphertext(self):
        with override_settings(FIELD_ENCRYPTION_KEY=Fernet.generate_key().decode()):
            with self.assertRaises(ImproperlyConfigured):
                self.driver.refresh_from_db()


class EncryptedProfilePhoneTests(APITestCase):
    def test_saving_a_profile_phone_number_stores_it_encrypted(self):
        user = get_user_model().objects.create_user(username='enc.profile', password=PASSWORD)
        driver = Driver.objects.create(user=user, name='Profile Driver')
        self.client.force_authenticate(user)

        response = self.client.patch(
            reverse('accounts:self-profile'), {'phone_number': NUMBER}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['phone_number'], NUMBER)
        self.assertTrue(
            raw_column('drivers_driver', 'phone_number', driver.pk).startswith(CIPHERTEXT_PREFIX)
        )
