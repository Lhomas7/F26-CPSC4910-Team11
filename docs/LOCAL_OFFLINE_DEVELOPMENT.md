# Local Offline Development

Use this guide when the shared AWS RDS instance is unavailable or when you need an isolated local environment. It runs Django against a local SQLite database while keeping the React workflow unchanged.

> [!IMPORTANT]
> SQLite data is local to one checkout and is not synchronized with AWS RDS. Verify database-sensitive work against MySQL before release.

> [!CAUTION]
> Never commit `backend/.env`, SQLite files, passwords, secret keys, MFA encryption keys, or provider credentials. Check `git status` before every commit.

## One-time setup

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

Run these from `backend` with the virtual environment active. The account commands are safe to rerun and use the disposable local password `DemoAccessAB12!`.

### Administrator

```powershell
python manage.py createsuperuser
```

Use the credentials you enter on the normal application sign-in page. The Django admin at `http://localhost:8000/admin/` is useful for direct model inspection but is not the normal application workflow.

### Sponsor organization

```powershell
python manage.py shell -c "from accounts.models import SponsorCompany; company, created = SponsorCompany.objects.get_or_create(name='Palmetto Freight'); print(('Created' if created else 'Already exists') + ': ' + company.name)"
```

### Sponsor user

```powershell
python manage.py shell -c "from django.contrib.auth import get_user_model; from accounts.models import SponsorCompany, SponsorAccount; User=get_user_model(); company=SponsorCompany.objects.get(name='Palmetto Freight'); user,_=User.objects.get_or_create(username='pat.sponsor'); user.first_name='Pat'; user.last_name='Sponsor'; user.email='pat.sponsor@example.com'; user.is_active=True; user.set_password('DemoAccessAB12!'); user.save(); SponsorAccount.objects.update_or_create(user=user, defaults={'company': company}); print('Ready: pat.sponsor')"
```

### Approved driver

```powershell
python manage.py shell -c "from django.contrib.auth import get_user_model; from accounts.models import SponsorCompany; from drivers.models import Driver; User=get_user_model(); company=SponsorCompany.objects.get(name='Palmetto Freight'); user,_=User.objects.get_or_create(username='jamie.rivera'); user.first_name='Jamie'; user.last_name='Rivera'; user.email='jamie.rivera@example.com'; user.is_active=True; user.set_password('DemoAccessAB12!'); user.save(); Driver.objects.update_or_create(user=user, defaults={'name':'Jamie Rivera','sponsor':company,'status':'approved'}); print('Ready: jamie.rivera - approved')"
```

### Pending driver

```powershell
python manage.py shell -c "from django.contrib.auth import get_user_model; from accounts.models import SponsorCompany; from drivers.models import Driver; User=get_user_model(); company=SponsorCompany.objects.get(name='Palmetto Freight'); user,_=User.objects.get_or_create(username='priya.nair'); user.first_name='Priya'; user.last_name='Nair'; user.email='priya.nair@example.com'; user.is_active=True; user.set_password('DemoAccessAB12!'); user.save(); Driver.objects.update_or_create(user=user, defaults={'name':'Priya Nair','sponsor':company,'status':'pending'}); print('Ready: priya.nair - pending')"
```

### Unlinked driver

```powershell
python manage.py shell -c "from django.contrib.auth import get_user_model; from drivers.models import Driver; User=get_user_model(); user,_=User.objects.get_or_create(username='unlinked.driver'); user.first_name='Morgan'; user.last_name='Lee'; user.email='morgan.lee@example.com'; user.is_active=True; user.set_password('DemoAccessAB12!'); user.save(); Driver.objects.update_or_create(user=user, defaults={'name':'Morgan Lee','sponsor':None,'status':'pending'}); print('Ready: unlinked.driver - unlinked')"
```

### Verify accounts

```powershell
python manage.py shell -c "from accounts.models import SponsorAccount; from drivers.models import Driver; print('SPONSORS'); [print(s.user.username, '-', s.company.name) for s in SponsorAccount.objects.select_related('user','company')]; print('DRIVERS'); [print(d.user.username, '-', d.status, '-', d.sponsor or 'No sponsor') for d in Driver.objects.select_related('user','sponsor')]"
```

### About-page release

Migrations provide baseline release data. To add or update the current local demo release, adjust this example's version, date, and description:

```powershell
python manage.py shell -c "from datetime import date; from about_page.models import AboutPageRelease; release, created = AboutPageRelease.objects.update_or_create(version_number='Sprint 4', defaults={'team_number': 11, 'release_date': date(2026, 10, 8), 'product_name': 'Good Driver Incentive Program', 'product_description': 'A role-based driver incentive platform with secure account management, sponsor driver enrollment, and auditable point-management workflows.'}); print(('Created' if created else 'Updated') + ': ' + release.version_number)"
```

```powershell
python manage.py shell -c "from about_page.models import AboutPageRelease; print(list(AboutPageRelease.objects.values('version_number', 'release_date')))"
```

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
