# Good Driver Incentive Program

The Good Driver Incentive Program is a full-stack web application for rewarding safe driving. Drivers maintain profiles and participate in sponsor programs, sponsors manage enrolled drivers, and administrators manage accounts and program information.

This repository is maintained by **CPSC 4910 Team 11**.

> [!IMPORTANT]
> Never commit database passwords, Django secret keys, MFA encryption keys, provider credentials, or populated `.env` files. Use the checked-in `.env.example` files as templates and share real values through an approved private channel.

## Contents

- [Current capabilities](#current-capabilities)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Local setup on Windows](#local-setup-on-windows)
- [Local setup on macOS or Linux](#local-setup-on-macos-or-linux)
- [Launching the application](#launching-the-application)
- [Testing and building](#testing-and-building)
- [Database and migrations](#database-and-migrations)
- [Environment variables](#environment-variables)
- [Git and release workflow](#git-and-release-workflow)
- [Documentation](#documentation)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

## Current capabilities

### Authentication and account security

- Driver and sponsor registration, with optional emailed-code verification
- Shared login flow with role-aware sessions
- Session authentication with CSRF protection
- "Is this your device?" check after sign-ins from a new browser or after repeated failed attempts
- Stricter idle and absolute session timeouts for administrators and shared devices
- Sign-out confirmation
- Password changes and password validation, with requirements served by the API and shown on demand
- Email-based password-reset request and confirmation flow
- Login-attempt auditing without requiring an existing user record
- Authenticator-app, email, and SMS MFA support
- Sponsor MFA enrollment requirements
- MFA backup codes, recovery, reset, and delivery throttling

### Profiles

- Authenticated self-profile viewing and editing
- Driver profile-picture upload and removal
- Driver sponsor-organization visibility
- Case-insensitive username uniqueness
- Consistent username normalization and validation
- Self-scoped profile authorization

### Administration

- Admin user directory with search and role filters
- Driver, sponsor, and administrator account creation
- Driver and sponsor account detail/edit pages
- Sponsor assignment and reassignment
- Account activation and deactivation
- Audited administrator view-as sessions for driver and sponsor troubleshooting
- Site-wide switch to require email verification for new accounts
- Role-aware access controls and validation

### Program information and driver management

- Database-backed About page with product, team, sprint/version, and release information
- Seed command for initial About-page content
- Sponsor-scoped driver list
- Driver-to-sponsor linking
- Driver detail viewing and approval workflow foundations

### Delivery and operations

- Pull-request and `main`-branch CI for Django and React
- Migration consistency and Django deployment checks
- Gitleaks repository secret scanning
- Docker Compose deployment with Django/Gunicorn and Caddy
- EC2 deployment through a protected GitHub production environment
- Database-aware API health check and post-deployment SPA asset smoke tests

## Architecture

```mermaid
flowchart LR
    U[Driver / Sponsor / Admin] --> R[React frontend]
    R -->|JSON API + session cookie| D[Django REST Framework]
    D --> M[(MySQL / AWS RDS)]
    D --> F[Media storage]
    D --> E[Email service or console]
    D --> S[SMS service or console]
```

| Layer | Technology | Default local address |
| --- | --- | --- |
| Frontend | React 19, React Router, React Scripts | `http://localhost:3000` |
| Backend | Django 6.1, Django REST Framework | `http://localhost:8000` |
| API | Session-authenticated JSON endpoints | `http://localhost:8000/api/` |
| Database | MySQL in shared environments; SQLite locally/tests | Configured in `backend/.env` |
| MFA | PyOTP, encrypted TOTP seeds, email/SMS delivery | Configured in `backend/.env` |

## Repository structure

```text
F26-CPSC4910-Team11/
├── .github/
│   └── workflows/
│       └── ci-cd.yml             # Automated test, build, and deployment workflow
├── backend/
│   ├── about_page/               # Release/About model, API, tests, and seed command
│   ├── accounts/                 # Authentication, profiles, MFA, and administration
│   │   ├── migrations/           # Account schema history
│   │   ├── routes/               # Feature-focused URL definitions
│   │   ├── serializers/          # Feature-focused request/response validation
│   │   ├── services/             # MFA, delivery, audit, notification, and reset logic
│   │   ├── tests/                # Feature-focused backend tests and shared helpers
│   │   └── views/                # Feature-focused API views
│   ├── config/                   # Settings, root URLs, health check, and AWS secrets
│   ├── drivers/                  # Driver data and sponsor-facing driver API
│   ├── sql/                      # Development and administrative SQL helpers
│   ├── .env.example
│   ├── manage.py
│   └── requirements.txt
├── docker/
│   ├── Caddyfile                 # Reverse proxy and static/media serving
│   ├── entrypoint.sh             # Container startup and migration entrypoint
│   └── web.Dockerfile            # Production application image
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/                  # HTTP client and domain-specific API modules
│   │   ├── app/                  # Routes, responsive shell, layout, and page headers
│   │   ├── auth/                 # Authentication context and session events
│   │   ├── components/           # Shared cross-feature UI
│   │   │   ├── assets/           # Illustrated people, scenery, vehicles, and effects
│   │   │   ├── branding/         # Brand marks, program messaging, and road animation
│   │   │   ├── feedback/         # Modals, confirmations, loading, and state panels
│   │   │   ├── forms/            # Shared password and selection controls
│   │   │   └── primitives/       # Avatars and interface icons
│   │   ├── data/                 # Shared static/reference data
│   │   ├── features/
│   │   │   ├── about/            # About and release information
│   │   │   ├── accounts/         # Profile, password, MFA, and login activity
│   │   │   ├── admin-users/      # User directory, account details, and registration settings
│   │   │   ├── authentication/   # Login, registration, device check, and password reset
│   │   │   ├── drivers/          # Driver pages, point controls, and linking workflow
│   │   │   ├── home/             # Public welcome page
│   │   │   ├── legal/            # Terms of Service and Privacy Notice
│   │   │   ├── playground/       # Development-only shared-asset gallery
│   │   │   └── sponsors/         # Sponsor-wide settings and controls
│   │   └── utils/                # Shared frontend validation utilities
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── docs/
│   ├── ACCOUNT_INPUT_VALIDATION.md
│   ├── DATABASE_ERD.md
│   ├── DEPLOYMENT.md
│   ├── PROJECT_TODO.md
│   └── SESSION_SECURITY.md
├── .dockerignore
├── .gitignore
├── docker-compose.yml
├── THIRD_PARTY_NOTICES.md
└── README.md
```

## Prerequisites

- Git
- Python compatible with the pinned Django version
- Node.js and npm
- MySQL client development dependencies when using MySQL
- Team 11 database credentials when using shared AWS RDS

SQLite can be used for isolated local development and automated tests. Shared integration work should be verified against MySQL before release.

## Local setup on Windows

Run these commands from PowerShell.

### 1. Clone and enter the repository

```powershell
git clone <repository-url>
cd "F26-CPSC4910-Team11"
```

### 2. Create the backend virtual environment

```powershell
cd backend
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell blocks virtual-environment activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

### 3. Create the backend environment file

```powershell
Copy-Item .env.example .env
```

For isolated local development, set this in `backend/.env`:

```dotenv
DB_ENGINE=sqlite
```

For shared integration testing, use `DB_ENGINE=mysql` and privately obtain the Team 11 application-database credentials. Do not use or commit the shared server administrator password.

Generate a Fernet key for local MFA encryption:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output into `TOTP_ENCRYPTION_KEY` in `backend/.env`.

> [!NOTE]
> Django loads `backend/.env` through the project settings. PowerShell does not use the Unix command `export $(grep ...)`.

### 4. Apply migrations

```powershell
python manage.py migrate
python manage.py check --database default
```

Optionally seed the About page:

```powershell
python manage.py seed_about_page
```

### 5. Install the frontend

Open another PowerShell terminal:

```powershell
cd "<repository-path>\frontend"
npm install
```

Use `npm ci` instead of `npm install` in CI or when reproducing the exact lockfile environment.

The frontend does not require a `.env` file for the standard local setup. It
defaults to `http://localhost:8000/api`. If Django runs at a different address,
create the optional file from the template before starting React:

```powershell
Copy-Item .env.example .env
```

## Local setup on macOS or Linux

Run these commands from Terminal. Start from the directory where the repository
should be stored:

```bash
git clone <repository-url>
cd F26-CPSC4910-Team11
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

Update `backend/.env` using the same database and MFA guidance from the Windows
section. Generate a local Fernet key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Then apply the database migrations:

```bash
python manage.py migrate
python manage.py check --database default
```

Optionally seed the About page:

```bash
python manage.py seed_about_page
```

Open another Terminal window and install the frontend:

```bash
cd <repository-path>/frontend
npm install
```

Use `npm ci` instead of `npm install` in CI or when reproducing the exact
lockfile environment.

The backend `.env` is required. The frontend `.env` is optional unless the API
is not served from `http://localhost:8000/api`. For a different API address:

```bash
cp .env.example .env
```

## Launching the application

Run the backend and frontend in two separate terminals. The commands below are
safe to repeat after pulling new changes; `pip` and `npm` will only install
dependencies that are missing or have changed.

### Terminal 1: backend on Windows

From the repository root in PowerShell:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py check
python manage.py migrate
python manage.py runserver
```

### Terminal 1: backend on macOS or Linux

From the repository root:

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
python manage.py check
python manage.py migrate
python manage.py runserver
```

The API is available at `http://localhost:8000/api/`.

The backend requires `backend/.env`. Copy `backend/.env.example` when setting up
a new checkout and replace its placeholders with local or privately supplied
values. Never commit the populated file.

### Terminal 2: frontend on Windows

From the repository root in a separate PowerShell terminal:

```powershell
cd frontend
npm install
npm start
```

### Terminal 2: frontend on macOS or Linux

From the repository root in a separate Terminal window:

```bash
cd frontend
npm install
npm start
```

The React development server normally opens `http://localhost:3000`.

No `frontend/.env` file is needed when the backend uses the default
`http://localhost:8000/api` address. To use another API address, copy
`frontend/.env.example` to `frontend/.env`, set `REACT_APP_API_URL`, and restart
the React development server.

If port 3000 is occupied, React may offer another port such as 3001. Django currently trusts the configured development origins, so either stop the old frontend process or add the alternate origin to the local CORS/CSRF configuration before testing authenticated writes.

## Testing and building

### Backend

From `backend/` on Windows PowerShell:

```powershell
$env:DB_ENGINE = "sqlite"
python manage.py test
python manage.py makemigrations --check --dry-run
python manage.py check
```

From `backend/` on macOS or Linux:

```bash
DB_ENGINE=sqlite python manage.py test
DB_ENGINE=sqlite python manage.py makemigrations --check --dry-run
DB_ENGINE=sqlite python manage.py check
```

### Frontend

From `frontend/` on Windows PowerShell:

```powershell
$env:CI = "true"
npm test -- --watchAll=false --runInBand
npm run build
```

From `frontend/` on macOS or Linux:

```bash
CI=true npm test -- --watchAll=false --runInBand
npm run build
```

Generated build output is not source code and should not be committed.

## Database and migrations

| `DB_ENGINE` | Use case |
| --- | --- |
| `sqlite` | Isolated local development and tests |
| `mysql` | Shared Team 11 integration database and deployment |

After pulling model or migration changes:

```powershell
# Windows PowerShell
cd backend
.\venv\Scripts\Activate.ps1
python manage.py migrate
```

```bash
# macOS or Linux
cd backend
source venv/bin/activate
python manage.py migrate
```

Before creating a migration, review the working tree and coordinate with teammates to avoid conflicting migration numbers.

```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py test
```

> [!CAUTION]
> Do not manually create Django-managed tables in production unless the team explicitly designed that operation. Schema changes should normally be represented by reviewed Django migrations.

The files under `backend/sql/` are administrative/development helpers. Review placeholders and the target schema carefully before executing them, and never add real credentials to these files.

## Environment variables

### Backend

Use [`backend/.env.example`](backend/.env.example) as the source of truth.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB_ENGINE` | Yes | `sqlite` or `mysql` |
| `DB_NAME` | For MySQL | Team application schema |
| `DB_USER` | For MySQL | Restricted application database user |
| `DB_PASSWORD` | For MySQL | Application database password |
| `DB_HOST` | For MySQL | MySQL/RDS hostname |
| `DB_PORT` | For MySQL | MySQL port; normally `3306` |
| `TOTP_ENCRYPTION_KEY` | Yes | Encrypts stored authenticator-app seeds |
| `EMAIL_*` | Optional locally | Email delivery; console backend is the local default |
| `TWILIO_*` | Optional locally | SMS delivery; blank values use the console/log fallback |

The TOTP encryption key must remain stable within an environment. Changing it without migrating existing data can make stored MFA seeds unreadable.

### Frontend

Use [`frontend/.env.example`](frontend/.env.example):

```dotenv
REACT_APP_API_URL=http://localhost:8000/api
```

This file is optional because the same URL is the application's built-in local
default. Restart `npm start` after changing it. React variables are embedded at
build time, exposed to anyone using the browser application, and must never
contain passwords, API secrets, or private credentials.

## Git and release workflow

- Develop on short-lived `feature/`, `fix/`, `docs/`, or `refactor/` branches.
- Open a pull request before merging into `main`.
- Include the sprint in commits that will reach `main`:

  ```text
  [Sprint 3] feat: add sponsor organization management
  ```

- Create professor-required annotated sprint tags from accepted `main` commits:

  ```powershell
  git switch main
  git pull --ff-only origin main
  git tag -a sprint-03 -m "Sprint 3 accepted release"
  git push origin sprint-03
  ```

- Create semantic version tags such as `v0.3.0` for deployable releases.
- Create GitHub Releases from version tags.
- Never move or reuse a published sprint or release tag.
- Store CI/CD credentials in GitHub repository or environment secrets.
- Use GitHub Actions for tests, releases, and deployment once those workflows are established.

See [`docs/PROJECT_TODO.md`](docs/PROJECT_TODO.md) for the detailed engineering, tagging, release, and deployment backlog.

## Documentation

- [Engineering backlog and project TODO](docs/PROJECT_TODO.md)
- [Account input validation and normalization](docs/ACCOUNT_INPUT_VALIDATION.md)
- [Session security: device check, timeouts, and sign-out](docs/SESSION_SECURITY.md)
- [Current database ERD](docs/DATABASE_ERD.md)
- [Deployment, secrets, Docker, and CI/CD](docs/DEPLOYMENT.md)
- [Frontend-specific development guide](frontend/README.md)
- [Backend environment template](backend/.env.example)
- [Frontend environment template](frontend/.env.example)
- API schema and a full data dictionary remain planned under `docs/`.
- Lucidchart is the collaborative source for DFDs, ERDs, and context diagrams; exported versions should be committed under `docs/diagrams/`.

## Security notes

- Never commit `.env` files or credentials.
- Never expose the RDS administrator password to the application.
- Do not use production data in screenshots, fixtures, or tests.
- Enforce permissions and validation in Django; frontend checks are usability features, not security boundaries.
- Keep secrets out of React builds because browser-delivered code is public.
- Rotate any credential that was committed or exposed.
- Run `python manage.py check --deploy` before production deployment.

## Troubleshooting

<details>
<summary><strong>PowerShell cannot activate the virtual environment</strong></summary>

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

</details>

<details>
<summary><strong>macOS cannot build or install mysqlclient</strong></summary>

Install the MySQL client libraries and `pkg-config` with Homebrew, reactivate the
virtual environment, and retry the requirements installation:

```bash
brew install mysql-client pkg-config
export PKG_CONFIG_PATH="$(brew --prefix mysql-client)/lib/pkgconfig"
source venv/bin/activate
pip install -r requirements.txt
```

Add the `PKG_CONFIG_PATH` export to the developer's shell profile if it is needed
in every new Terminal session. This is a local machine setting and does not
belong in the repository.

</details>

<details>
<summary><strong>Django reports missing database variables</strong></summary>

Confirm that `backend/.env` exists and that `DB_ENGINE` matches the variables supplied. MySQL requires `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_HOST`; SQLite does not.

</details>

<details>
<summary><strong>Django reports a missing TOTP encryption key</strong></summary>

Generate a Fernet key and add it to `backend/.env`:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

</details>

<details>
<summary><strong>MySQL Workbench warns about MySQL 8.4</strong></summary>

Workbench may warn when the server is newer than the versions it officially targets. This does not necessarily mean the connection failed. Continue only when the hostname and credentials came from the approved team source, then confirm the expected Team 11 schema is present.

</details>

<details>
<summary><strong>The frontend starts on port 3001</strong></summary>

Another process is using port 3000. Stop that process and restart React, or update the local backend CORS and CSRF trusted origins before making authenticated requests from the alternate port.

</details>

---

_Last updated: 2026-10-06_
