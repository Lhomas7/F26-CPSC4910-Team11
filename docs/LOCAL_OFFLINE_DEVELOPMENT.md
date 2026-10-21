# Local Offline Development

Use this guide when the shared AWS RDS instance is unavailable or when you need an isolated local environment. It runs Django against a local SQLite database while keeping the React workflow unchanged.

> [!IMPORTANT]
> SQLite data is local to one checkout and is not synchronized with AWS RDS. Verify database-sensitive work against MySQL before release.
> Never commit `backend/.env`, SQLite files, passwords, secret keys, MFA encryption keys, or provider credentials. Check `git status` before every commit.

## One-time setup

The preferred repeatable workflow is now the repository-root
[development task launcher](LOCAL_DEV_TASKS.md): `python dev.py setup`, followed
by `.env` configuration and `python dev.py setup --skip-install --migrate`.
Launch with `python dev.py run` and `python dev.py frontend` in separate
terminals. Existing environments are reused and existing `.env` files are
preserved. The manual commands below remain available for troubleshooting.

### Windows PowerShell

```powershell
cd backend
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
cd ..\frontend
npm install
cd ..
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\venv\Scripts\Activate.ps1
```

### macOS or Linux

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cd ../frontend
npm install
cd ..
```

## Configure SQLite

If `backend/.env` does not exist, copy the template:

```powershell
# Windows PowerShell
Copy-Item backend\.env.example backend\.env
```

```bash
# macOS or Linux
cp backend/.env.example backend/.env
```

Set these local values in `backend/.env`:

```dotenv
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
DJANGO_SECURE_SSL_REDIRECT=false

DB_ENGINE=sqlite

FRONTEND_URL=http://localhost:3000
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
AWS_SECRETS_MANAGER_SECRET_ID=
```

Existing MySQL variables may remain; Django ignores them while `DB_ENGINE=sqlite`.

Generate unique local secrets from `backend` with the virtual environment active:

```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add the results to `backend/.env`:

```dotenv
DJANGO_SECRET_KEY=<first-generated-value>
TOTP_ENCRYPTION_KEY=<second-generated-value>
```

Keep the TOTP key stable for this database or existing authenticator secrets will become unreadable.

No frontend `.env` is required for the normal ports. If needed, copy `frontend/.env.example` to `frontend/.env`; its local value is:

```dotenv
REACT_APP_API_URL=http://localhost:8000/api
```

## Initialize the local database

From `backend`, activate the environment and verify Django selected SQLite:

```powershell
# Windows PowerShell
.\venv\Scripts\Activate.ps1
python manage.py shell -c "from django.conf import settings; print(settings.DATABASES['default']['ENGINE']); print(settings.DATABASES['default']['NAME'])"
```

```bash
# macOS or Linux
source venv/bin/activate
python manage.py shell -c "from django.conf import settings; print(settings.DATABASES['default']['ENGINE']); print(settings.DATABASES['default']['NAME'])"
```

The result should identify `django.db.backends.sqlite3` and `backend/db.sqlite3`. Then run:

```powershell
python manage.py migrate
python manage.py check
```

### Replace an incompatible old SQLite database

If migration reports invalid legacy rows or missing relationships, stop Django, preserve the old file, and migrate a clean database.

```powershell
# Windows PowerShell
Move-Item -LiteralPath ".\db.sqlite3" -Destination ".\db-pre-local-reset.sqlite3"
python manage.py migrate
```

```bash
# macOS or Linux
mv ./db.sqlite3 ./db-pre-local-reset.sqlite3
python manage.py migrate
```

The backup remains local and ignored by Git.

## Create local demonstration data

After applying migrations, run from the repository root:

```text
python dev.py seed
```

Or from `backend` with the virtual environment active:

```text
python manage.py seed_local_demo
```

The command requires SQLite and `DJANGO_DEBUG=true`. It refuses MySQL and
non-debug environments, checks for pending migrations, and creates these
accounts only when missing:

| Username | Initial state |
| -------- | ------------- |
| `demo.admin` | Application administrator; enroll MFA at first sign-in |
| `pat.sponsor` | Sponsor at Palmetto Freight; enroll MFA at first sign-in |
| `jamie.rivera` | Approved Driver at Palmetto Freight |
| `priya.nair` | Pending Driver at Palmetto Freight |
| `unlinked.driver` | Pending Driver without an organization |

Enter a password privately when prompted. It must satisfy the application
password policy and is assigned only to newly created accounts. There is no
hardcoded password or automatic MFA enrollment. The seeded administrator is an
application staff account, not a Django superuser. Use `createsuperuser`
separately if you need unrestricted access to Django's administrative site.

Reruns preserve existing passwords, MFA, edited names, activation, organization
assignments, and Driver states. A matching username with an unexpected email
or role stops the command instead of repurposing the account. The legacy
`unlinked.driver` email `morgan.lee@example.com` remains supported.

Jamie receives two sample point entries: +100 and -15, for a starting balance
of 85. Reruns do not duplicate those entries. Sample points are skipped if the
existing approved Driver or Sponsor has moved to another organization or the
Driver's status has changed. No external point-change notifications are sent
by this fixture command.

For noninteractive setup, provide a private `GDIP_DEMO_PASSWORD` environment
value and use `python dev.py seed --noinput`. Do not put the password in command
arguments or commit it. If all accounts already exist, no password is needed.

About data is optional:

```text
python dev.py seed --with-about
```

This adds a separate `Local demo` release dated on its first creation. It can
become the current About entry; it does not rewrite historical sprint records.
Reruns preserve the existing local release. This is demonstration data, not the
official release-metadata publishing workflow.

The command has no reset/delete option. To recover or rebuild an isolated
local database, preserve it first and follow [MIGRATIONS.md](MIGRATIONS.md).

## Launch the application

Keep two terminals open.

### Terminal 1: backend

```powershell
# Windows PowerShell
cd "C:\path\to\F26-CPSC4910-Team11\backend"
.\venv\Scripts\Activate.ps1
python manage.py runserver
```

```bash
# macOS or Linux
cd /path/to/F26-CPSC4910-Team11/backend
source venv/bin/activate
python manage.py runserver
```

Backend: `http://localhost:8000`

### Terminal 2: frontend

```powershell
cd frontend
npm start
```

Frontend: `http://localhost:3000`  
Sign in: `http://localhost:3000/login`

If port 3000 is occupied, stop the old process instead of accepting another port. A different port must also be added to the backend CORS and CSRF origin lists.

## Test accounts and workflows

| Role | Username | Password | State |
| --- | --- | --- | --- |
| Sponsor | `pat.sponsor` | `DemoAccessAB12!` | Palmetto Freight |
| Driver | `jamie.rivera` | `DemoAccessAB12!` | Approved and linked |
| Driver | `priya.nair` | `DemoAccessAB12!` | Pending and linked |
| Driver | `unlinked.driver` | `DemoAccessAB12!` | No sponsor |
| Administrator | Entered during `createsuperuser` | Entered during `createsuperuser` | Active |

Suggested smoke test:

1. Sign in as the administrator and verify Users and role totals.
2. Exercise the administrator view-as workflow for the sponsor and approved driver.
3. Sign in as `pat.sponsor`, approve `priya.nair`, and adjust points for `jamie.rivera`.
4. Sign in as `jamie.rivera` and verify the balance and point-history entry.
5. Sign in as `unlinked.driver` and verify the no-sponsor guidance.
6. Open About and confirm the intended release.

Use separate browser profiles or a private window to compare roles. One browser session cannot remain signed in as several users simultaneously. Never use these disposable credentials in a shared environment.

## Local MFA, email, and SMS

MFA still applies locally. With console email and blank Twilio settings:

- email messages and codes print in the Django terminal;
- local SMS codes print in the Django terminal;
- authenticator-app enrollment uses the local `TOTP_ENCRYPTION_KEY`;
- a new browser may trigger the trusted-device flow.

Keep the backend terminal visible while testing authentication. Do not commit or share printed codes.

## Troubleshooting

### Diagnose the environment

From `backend`, with the virtual environment active:

```text
python manage.py doctor
```

This command reports SQLite versus potentially shared MySQL, the database
target, Debug status, frontend origin/CORS/CSRF alignment, email/SMS delivery
modes, and encryption-key format. Secret values, database passwords, and provider
credentials are hidden. A valid key format does not prove it can decrypt data
that was encrypted previously.

If effective environment values differ from `backend/.env`, the report names
the variables without printing either value. Inherited process variables and
runtime secrets can override the file. Review those names and retry from a
fresh terminal if an old shell override is selecting the wrong database.

Connectivity is opt-in:

```text
python manage.py doctor --check-database
```

The database check uses `SELECT 1` and reads migration metadata. It does not
apply migrations, seed records, or create a missing SQLite database. It lists
unapplied migrations and checks for inconsistent history or conflicting leaves.
Pending migrations are advisory and do not fail the command; failed
connectivity, invalid keys, conflicts, and inconsistent history do. Inspect
`python manage.py migrate --plan` before applying migrations separately.

Django settings must load before any management command can run. If a required
startup value such as `TOTP_ENCRYPTION_KEY` or a MySQL connection variable is
missing, correct the startup error first. The future setup/bootstrap command
will handle diagnostics before Django loads.

Diagnostics do not test the HTTP server, prove external email/SMS delivery,
or guarantee parity between SQLite and MySQL. Windows tests cover the command;
macOS and live MySQL checks remain separate verification work.

### Django tries to contact RDS

An error containing `MySQLdb.OperationalError` and the RDS hostname means the process selected MySQL. Confirm `DB_ENGINE=sqlite` in `backend/.env`. Shell variables such as `$env:DB_ENGINE` or `export DB_ENGINE` affect only that terminal and override `.env`.

```powershell
python manage.py shell -c "from django.conf import settings; print(settings.DATABASES['default']['ENGINE']); print(settings.DATABASES['default']['NAME'])"
```

### The frontend cannot load data

Confirm Django is running at `http://localhost:8000`, open `http://localhost:8000/api/health/`, and inspect the Django terminal for the underlying error.

### Port 3000 or 8000 is occupied

Return to the older process's terminal and press `Ctrl+C`. If React must use port 3001, add `http://localhost:3001` to both `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS`, then restart Django.

### Confirm local data is ignored

```powershell
git status --short
git check-ignore backend/db.sqlite3
```

## Return to AWS RDS

1. Stop Django.
2. Change `DB_ENGINE=sqlite` to `DB_ENGINE=mysql` in the ignored `backend/.env`.
3. Confirm the private MySQL values are present.
4. Use a fresh terminal so no shell-level database override remains.
5. Review the connection and migration plan:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python manage.py check --database default
python manage.py migrate --plan
```

Do not run `migrate` against the shared database until the team reviews the plan and coordinates the change. The local SQLite file may remain; Django and Git ignore it while MySQL is selected.
