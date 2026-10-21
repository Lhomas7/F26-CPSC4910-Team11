from pathlib import Path
from contextlib import closing
import sqlite3
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from backend.accounts.services.local_database import backup_database, inspect_database, restore_database


class LocalDatabaseArchiveTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.target = self.directory / 'db.sqlite3'
        self.archives = self.directory / 'archives'
        with closing(sqlite3.connect(self.target)) as database, database:
            database.execute('CREATE TABLE example (value INTEGER)')
            database.execute('INSERT INTO example VALUES (1)')

    def value(self, path):
        database = sqlite3.connect(path)
        try:
            return database.execute('SELECT value FROM example').fetchone()[0]
        finally:
            database.close()

    def test_backups_are_unique_and_source_is_preserved(self):
        first = backup_database(self.target, self.archives)
        second = backup_database(self.target, self.archives)
        self.assertNotEqual(first, second)
        self.assertEqual(self.value(first), 1)
        self.assertEqual(self.value(self.target), 1)
        self.assertEqual(inspect_database(first), [])

    def test_collision_does_not_overwrite_existing_archive(self):
        with patch('backend.accounts.services.local_database.datetime') as clock, patch('backend.accounts.services.local_database.uuid4') as uuid:
            clock.now.return_value.strftime.return_value = 'fixed'
            uuid.return_value.hex = 'constantidentifier'
            first = backup_database(self.target, self.archives)
            with self.assertRaises(FileExistsError):
                backup_database(self.target, self.archives)
        self.assertEqual(self.value(first), 1)

    def test_backup_includes_committed_wal_data(self):
        database = sqlite3.connect(self.target)
        try:
            database.execute('PRAGMA journal_mode=WAL')
            database.execute('UPDATE example SET value = 3')
            database.commit()
            archive = backup_database(self.target, self.archives)
            self.assertEqual(self.value(archive), 3)
        finally:
            database.close()

    def test_failed_replacement_retains_current_database_and_backup(self):
        archive = backup_database(self.target, self.archives)
        with patch('backend.accounts.services.local_database.os.replace', side_effect=PermissionError('File open')):
            with self.assertRaises(PermissionError):
                restore_database(archive, self.target, self.archives)
        self.assertEqual(self.value(self.target), 1)
        preserved = list(self.archives.glob('before-restore-*'))
        self.assertEqual(len(preserved), 1)
        self.assertEqual(self.value(preserved[0]), 1)
        self.assertFalse(list(self.archives.glob('restore-stage-*')))

    def test_restore_preserves_current_database_before_replacement(self):
        archive = backup_database(self.target, self.archives)
        with closing(sqlite3.connect(self.target)) as database, database:
            database.execute('UPDATE example SET value = 2')

        preserved = restore_database(archive, self.target, self.archives)

        self.assertEqual(self.value(self.target), 1)
        self.assertEqual(self.value(preserved), 2)
        self.assertEqual(self.value(archive), 1)
        self.assertFalse(list(self.archives.glob('restore-stage-*')))

    def test_invalid_archive_does_not_replace_current_database(self):
        archive = self.directory / 'broken.sqlite3'
        archive.write_bytes(b'not a database')
        with self.assertRaises(sqlite3.Error):
            restore_database(archive, self.target, self.archives)
        self.assertEqual(self.value(self.target), 1)

    def test_journal_files_block_restore(self):
        archive = backup_database(self.target, self.archives)
        Path(str(self.target) + '-wal').touch()
        with self.assertRaisesRegex(ValueError, 'journal files exist'):
            restore_database(archive, self.target, self.archives)
        self.assertEqual(self.value(self.target), 1)

    def test_missing_database_is_not_created_by_inspection(self):
        missing = self.directory / 'missing.sqlite3'
        with self.assertRaises(ValueError):
            inspect_database(missing)
        self.assertFalse(missing.exists())
