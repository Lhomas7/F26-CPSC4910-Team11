from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest

from scripts.check_tracked_files import main, rejection_reason


class TrackedFileRulesTests(unittest.TestCase):
    def test_local_artifacts_are_rejected(self):
        for path in (
            '.env', 'backend/.env', 'frontend/.env.production', 'backend/.env.backup',
            'backend/db.sqlite3', 'backend/db.sqlite3-wal', 'backend/db.sqlite3-shm',
            'backend/db.sqlite3-journal', 'backend/snapshot.sqlite3.backup',
            'local.DB', 'backend/.local-backups/anything.json',
            'backend/.local-backups/.env.example',
            'backend/media/avatar.png', 'frontend/build/index.html',
            'backend/venv/pyvenv.cfg', 'frontend/node_modules/a.js',
            'backend/__pycache__/file.pyc', 'logs/session.txt',
        ):
            with self.subTest(path=path):
                self.assertIsNotNone(rejection_reason(path))

    def test_templates_source_and_reviewed_sql_are_allowed(self):
        for path in (
            'backend/.env.example', 'frontend/.env.production.example',
            'backend/sql/create_admin_user.sql', 'backend/accounts/models.py',
            'backend/about_page/release_metadata.json',
            'docs/MIGRATIONS.md', 'frontend/src/styles/tokens.css',
            'tests/test_tracked_files.py',
        ):
            with self.subTest(path=path):
                self.assertIsNone(rejection_reason(path))

    def test_force_added_ignored_file_is_detected_but_untracked_file_is_not(self):
        with TemporaryDirectory() as temporary:
            repository = Path(temporary)
            def git(*args):
                subprocess.run(['git', '-C', str(repository), *args], check=True, capture_output=True)
            git('init')
            (repository / '.gitignore').write_text('.env\n', encoding='utf-8')
            (repository / '.env').write_text('PRIVATE_VALUE=do-not-echo\n', encoding='utf-8')
            git('add', '.gitignore')
            with redirect_stdout(StringIO()):
                self.assertEqual(main(repository), 0)
            git('add', '-f', '.env')
            error = StringIO()
            with redirect_stderr(error):
                self.assertEqual(main(repository), 1)
            self.assertIn("'.env'", error.getvalue())
            self.assertNotIn('do-not-echo', error.getvalue())
            git('rm', '--cached', '--', '.env')
            self.assertTrue((repository / '.env').exists())
            with redirect_stdout(StringIO()):
                self.assertEqual(main(repository), 0)
