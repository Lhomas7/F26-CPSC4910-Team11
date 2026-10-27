"""SQLite archive operations; no Django configuration or credentials required."""

import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


def read_database(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise ValueError('Database file does not exist.')
    return sqlite3.connect(f'{path.as_uri()}?mode=ro', uri=True, timeout=5)


def inspect_database(path):
    database = read_database(path)
    try:
        if database.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise ValueError('Database integrity check failed.')
        has_history = database.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='django_migrations'"
        ).fetchone()
        migrations = database.execute('SELECT app, name FROM django_migrations ORDER BY app, name').fetchall() if has_history else []
        return migrations
    finally:
        database.close()


def backup_database(source, directory, label='backup'):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')
    destination = directory / f'{label}-{timestamp}-{uuid4().hex[:12]}.sqlite3'
    destination.touch(exist_ok=False)
    try:
        source_connection = read_database(source)
        try:
            target = sqlite3.connect(destination)
            try:
                source_connection.backup(target)
            finally:
                target.close()
        finally:
            source_connection.close()
        inspect_database(destination)
        return destination
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def restore_database(source, target, directory):
    source, target = Path(source), Path(target)
    # A server-stopped acknowledgment is required by the command. Sidecars
    # additionally catch common active/stale journal cases before replacement.
    for path in (source, target):
        if any(Path(str(path) + suffix).exists() for suffix in ('-wal', '-shm', '-journal')):
            raise ValueError('SQLite journal files exist. Stop database processes and resolve journaling before restoring.')
    inspect_database(source)
    stage = backup_database(source, directory, 'restore-stage')
    try:
        preserved = backup_database(target, directory, 'before-restore') if target.exists() else None
        os.replace(stage, target)
        return preserved
    finally:
        stage.unlink(missing_ok=True)
