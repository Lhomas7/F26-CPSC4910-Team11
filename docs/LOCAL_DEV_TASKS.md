# Cross-platform development tasks

Run these commands from the repository root. The task names and options are
the same on Windows and macOS. Use a Python 3.12+ launcher installed on your
machine: usually `python` on Windows or `python3` on macOS. If your terminal
already recognizes `python`, the examples below work unchanged.

The root `dev.py` launcher reads paths from `[tool.gdip.dev]` in
`pyproject.toml`. It selects `backend/venv/Scripts/python.exe` on Windows or
`backend/venv/bin/python` on macOS/Linux. You do not need to activate that
environment in the terminal. This does not change how your editor selects its
Python interpreter.

## First setup

Install Python 3.12+, Node.js 22+/npm, and any platform-specific `mysqlclient` build
prerequisites, then run:

```text
python dev.py setup
```

Setup creates or reuses `backend/venv`, installs the backend runtime requirements,
and runs `npm ci` using the frontend lockfile. If `.env` is missing, it copies
the template and stops for configuration. It never replaces an existing `.env`,
prints secret values, or rotates an encryption key.

For a new isolated local database, keep `DB_ENGINE=sqlite` and configure
`DJANGO_SECRET_KEY` and `TOTP_ENCRYPTION_KEY` in `backend/.env`. The template
contains commands for generating local values. Keep the existing encryption
key when reusing a database with encrypted MFA or phone data.

Then complete setup:

```text
python dev.py setup --skip-install --migrate
```

`--skip-install` reuses installed dependencies. Omit it after pulling changes
to dependency files. `--backend-only` skips frontend dependency installation
when you are working only on Django.

Repeated setup is safe for configuration and application data. Dependency
installation may refresh packages; `npm ci` recreates `node_modules` from the
lockfile. Setup does not create accounts or demonstration records.

## Start the application

Open two terminals at the repository root:

```text
python dev.py run
```

```text
python dev.py frontend
```

Backend startup performs environment preflight, doctor reporting, Django system
checks, connectivity/history inspection, migration-plan review output, and an
applied-migration check before running Django. A failure stops the sequence.
The frontend remains a separate visible process so both logs and Ctrl+C work
normally.

If migrations are pending, review the plan and explicitly apply them:

```text
python dev.py run --migrate
```

Use `--address 127.0.0.1:8001` to select another backend address. Update the
frontend API configuration if you change the port; the launcher does not alter
frontend environment files.

## Local demonstration data

After initializing the local database, create the demo accounts and point ledger:

```text
python dev.py seed
```

It requires SQLite and Debug mode. Enter a password privately for new accounts;
reruns preserve existing passwords, MFA, edited profiles, and transaction history.
Use `--noinput` with a private `GDIP_DEMO_PASSWORD` environment value for automation.
Use `--with-about` only when you want a separate `Local demo` About entry.

See the [demo-data guide](LOCAL_OFFLINE_DEVELOPMENT.md#create-local-demonstration-data)
for account names, initial states, and limitations. Seeding is a separate explicit
step; ordinary setup and startup do not create or reset accounts.

## Diagnose configuration

```text
python dev.py doctor
python dev.py doctor --check-database
```

The first command does not connect to the database. The second performs the
read-only inspection described in
[LOCAL_OFFLINE_DEVELOPMENT.md](LOCAL_OFFLINE_DEVELOPMENT.md#diagnose-the-environment).

The launcher validates required environment values before importing Django,
including missing encryption keys and placeholder MySQL credentials. Effective
process variables take precedence over `.env`. Runtime AWS secret loading is
refused by these local tasks: use a separate local configuration, or use the
documented deployment workflow for an AWS runtime.

## Shared MySQL

Configure `DB_ENGINE=mysql` and the restricted Team 11 application credentials
privately. Inspect the selected target and migration plan first:

```text
python dev.py doctor --check-database
```

Applying migrations requires both explicit options:

```text
python dev.py run --migrate --allow-shared-db
```

`--allow-shared-db` acknowledges the selected shared target; it does not choose
a database, change permissions, or authorize dropping data. If no migrations
are pending, `python dev.py run` works without that option. These commands do
not seed, reset, drop, or replace shared data.

## Configuration and ownership

```toml
[tool.gdip.dev]
backend = "backend"
frontend = "frontend"
venv = "backend/venv"
requirements = "backend/requirements.txt"
```

Paths are relative to the repository and must stay inside it. The existing
requirements files remain the Python dependency source of truth. This task
configuration does not make the Django application a pip-installable package
and adds no task-runner dependency. Frontend dependencies remain managed by npm.

Manual `manage.py` and npm commands remain supported. Use the launcher for the
repeatable checks and launch sequence. It is a local-development tool, not a
replacement for Gunicorn, Docker, or the deployment entrypoint.

## Verification

The focused launcher tests mock installation and server processes and use
temporary fixtures:

```text
python -m unittest discover -s tests -p test_dev_tasks.py
```

They verify environment selection, explicit migration options, preservation of
existing `.env`, setup initialization, and stopping on failure. They do not
install dependencies or modify a real database. Windows behavior is tested
locally; native macOS setup and shared MySQL integration still need teammate
verification.
