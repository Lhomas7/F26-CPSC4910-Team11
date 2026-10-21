"""Cross-platform local development tasks. Run `python dev.py --help` from the repo."""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib


ROOT = Path(__file__).resolve().parent

# Runs with the backend environment's Python, before importing Django. Return
# only names/statuses; subprocess errors must never echo secret-bearing values.
PREFLIGHT = r'''
import json, os
from pathlib import Path
from dotenv import load_dotenv
from cryptography.fernet import Fernet
load_dotenv(Path('.env'))
engine = os.environ.get('DB_ENGINE', 'sqlite').lower()
errors = []
if engine not in ('sqlite', 'mysql'):
    errors.append('DB_ENGINE must be sqlite or mysql.')
if os.environ.get('AWS_SECRETS_MANAGER_SECRET_ID'):
    errors.append('Runtime AWS secrets are enabled. Use a separate local environment before running local development tasks.')
if engine == 'mysql':
    for name in ('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'):
        value = os.environ.get(name, '')
        if not value or value.startswith('replace-with-') or value.startswith('<'):
            errors.append(name + ' is missing or still contains a placeholder.')
for name in ('TOTP_ENCRYPTION_KEY', 'FIELD_ENCRYPTION_KEY'):
    value = os.environ.get(name) or (os.environ.get('TOTP_ENCRYPTION_KEY') if name == 'FIELD_ENCRYPTION_KEY' else '')
    try:
        Fernet(value.encode())
    except (ValueError, AttributeError, TypeError):
        errors.append(name + ' must contain a valid Fernet key; keep existing encryption keys stable.')
debug = os.environ.get('DJANGO_DEBUG', '').lower() in ('1', 'true', 'yes', 'on')
secret = os.environ.get('DJANGO_SECRET_KEY', '')
if (not secret and not debug) or secret.startswith('replace-with-'):
    errors.append('Configure DJANGO_SECRET_KEY in backend/.env.')
print(json.dumps({'engine': engine, 'errors': errors}))
'''


class TaskError(Exception):
    pass


def configured_path(value):
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT):
        raise TaskError('Development paths in pyproject.toml must remain inside the repository.')
    return path


def configuration():
    with (ROOT / 'pyproject.toml').open('rb') as source:
        config = tomllib.load(source)['tool']['gdip']['dev']
    return {name: configured_path(config[name]) for name in (
        'backend', 'frontend', 'venv', 'requirements',
    )}


def run(command, cwd):
    result = subprocess.run([str(part) for part in command], cwd=cwd, check=False)
    if result.returncode:
        raise TaskError(f'Task stopped with exit code {result.returncode}. Review the preceding command output.')


def backend_python(config):
    directory = 'Scripts' if sys.platform == 'win32' else 'bin'
    name = 'python.exe' if sys.platform == 'win32' else 'python'
    return config['venv'] / directory / name


def npm():
    executable = shutil.which('npm.cmd' if sys.platform == 'win32' else 'npm')
    if not executable:
        raise TaskError('Install Node.js and npm, reopen the terminal, and retry.')
    return executable


def check_node():
    node = shutil.which('node')
    if not node:
        raise TaskError('Install Node.js 22+ and npm, reopen the terminal, and retry.')
    result = subprocess.run([node, '--version'], capture_output=True, text=True, check=False)
    try:
        major = int(result.stdout.strip().lstrip('v').split('.')[0])
    except ValueError:
        raise TaskError('Could not determine the Node.js version.') from None
    if result.returncode or major < 22:
        raise TaskError('Use Node.js 22 or newer; CI currently uses Node.js 22.')
    npm()


def preflight(config):
    python = backend_python(config)
    if not python.is_file():
        raise TaskError('Backend virtual environment is missing. Run: python dev.py setup')
    result = subprocess.run(
        [str(python), '-c', PREFLIGHT], cwd=config['backend'],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise TaskError('Backend preflight could not run. Check the virtual environment and install requirements with python dev.py setup.')
    try:
        report = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise TaskError('Backend preflight returned an invalid report.') from None
    if report['errors']:
        raise TaskError('\n'.join(report['errors']))
    print('Database mode: SQLite (isolated/local)' if report['engine'] == 'sqlite'
          else 'Database mode: MySQL (potentially shared)', flush=True)
    return report['engine']


def check_shared(engine, options):
    if engine == 'mysql' and not options.allow_shared_db:
        raise TaskError('MySQL migrations require --allow-shared-db after reviewing the database target and migration plan.')


def manage(config, *args):
    run([backend_python(config), 'manage.py', *args], config['backend'])


def prepare_database(config, options, engine):
    # Inspect the target before any migration runs. New SQLite files are created
    # only by the explicit migrate path, never by doctor.
    manage(config, 'doctor')
    manage(config, 'check')
    sqlite_exists = (config['backend'] / 'db.sqlite3').is_file()
    if engine != 'sqlite' or sqlite_exists:
        manage(config, 'doctor', '--check-database')
        manage(config, 'migrate', '--plan')
    if options.migrate:
        check_shared(engine, options)
        manage(config, 'migrate', '--noinput')
    elif engine == 'sqlite' and not sqlite_exists:
        raise TaskError('SQLite database is missing. Run setup or run with --migrate to initialize it.')
    manage(config, 'migrate', '--check')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest='command', required=True)
    setup = subcommands.add_parser('setup', help='Create/reuse the venv, install dependencies, and validate local setup.')
    setup.add_argument('--backend-only', action='store_true', help='Skip npm installation.')
    setup.add_argument('--skip-install', action='store_true', help='Reuse already installed dependencies.')
    start = subcommands.add_parser('run', help='Check the backend and start Django; frontend runs in another terminal.')
    start.add_argument('--address', default='127.0.0.1:8000')
    for task in (setup, start):
        task.add_argument('--migrate', action='store_true', help='Apply reviewed migrations before continuing.')
        task.add_argument('--allow-shared-db', action='store_true', help='Explicitly acknowledge migrations against the selected MySQL database.')
    doctor = subcommands.add_parser('doctor', help='Report configuration without writing application data.')
    doctor.add_argument('--check-database', action='store_true')
    subcommands.add_parser('frontend', help='Start React in this terminal.')
    options = parser.parse_args(argv)
    try:
        if sys.version_info < (3, 12):
            raise TaskError('Use Python 3.12 or newer for the backend development tasks.')
        config = configuration()
        if options.command == 'frontend':
            check_node()
            run([npm(), 'start'], config['frontend'])
            return 0
        if options.command == 'setup':
            if not options.backend_only and not options.skip_install:
                check_node()
            if not backend_python(config).is_file():
                if options.skip_install:
                    raise TaskError('--skip-install requires an existing virtual environment.')
                run([sys.executable, '-m', 'venv', config['venv']], ROOT)
            if not options.skip_install:
                run([backend_python(config), '-m', 'pip', 'install', '-r', config['requirements']], ROOT)
                if not options.backend_only:
                    run([npm(), 'ci'], config['frontend'])
            env_file = config['backend'] / '.env'
            if not env_file.exists():
                # Exclusive creation protects an environment another process just created.
                with env_file.open('x', encoding='utf-8') as destination:
                    destination.write((config['backend'] / '.env.example').read_text(encoding='utf-8'))
                raise TaskError('Created backend/.env from the template. Set DB_ENGINE=sqlite and configure local secrets, then rerun setup --skip-install --migrate. Existing databases and keys were not changed.')
        engine = preflight(config)
        if options.command == 'doctor':
            manage(config, 'doctor', *(['--check-database'] if options.check_database else []))
        else:
            prepare_database(config, options, engine)
            if options.command == 'run':
                manage(config, 'runserver', options.address)
            else:
                print('Setup verified. Start the backend with python dev.py run and React with python dev.py frontend.')
        return 0
    except (TaskError, OSError, KeyError, tomllib.TOMLDecodeError) as error:
        print(f'Development task failed: {error}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
