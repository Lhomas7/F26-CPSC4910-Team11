# Deployment and secrets

This document covers how the Django backend is configured for a deployed
environment, how secrets reach it, and what is still undecided.

> **Deployment status:** the application is not deployed yet.
> Record the URL here once it is: _Staging: TBD · Production: TBD_

## How configuration works

`backend/config/settings.py` reads, in this order (first match wins):

1. Real process environment variables
2. `backend/.env` (local development only; git-ignored)
3. **AWS Secrets Manager**, when `AWS_SECRETS_MANAGER_SECRET_ID` is set

Django runs in **secure mode by default**. `DJANGO_DEBUG` must be `true` to enable
debug mode, and only local `.env` files should ever set it.

### Environment variables

| Variable | Deployed value | Notes |
| --- | --- | --- |
| `DJANGO_DEBUG` | unset / `false` | Never `true` on a server |
| `DJANGO_SECRET_KEY` | secret | Required when not in debug mode; startup fails without it |
| `DJANGO_ALLOWED_HOSTS` | `api.example.com` | Comma-separated host names |
| `DJANGO_CORS_ALLOWED_ORIGINS` | `https://app.example.com` | Origins of the React app |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://app.example.com` | Same origins, with scheme |
| `FRONTEND_URL` | `https://app.example.com` | Base of password-reset links |
| `DJANGO_BEHIND_PROXY` | `true` behind a load balancer | Trusts `X-Forwarded-Proto` so HTTPS redirect does not loop |
| `DJANGO_SECURE_SSL_REDIRECT` | default `true` | Set `false` only if TLS is fully handled upstream |
| `DJANGO_SECURE_HSTS_SECONDS` | default `3600` | Raise (e.g. `31536000`) once HTTPS is proven; browsers cache it |
| `DJANGO_COOKIE_DOMAIN` | `.example.com` | Only if app and API are on different subdomains |
| `DJANGO_SESSION_COOKIE_SAMESITE` | default `Lax` | `None` is needed only for genuinely cross-site deployments |
| `DB_*`, `TOTP_ENCRYPTION_KEY`, `EMAIL_*`, `TWILIO_*` | secrets | See below |
| `AWS_SECRETS_MANAGER_SECRET_ID` | secret name or ARN | Turns on Secrets Manager loading |
| `AWS_REGION` | e.g. `us-east-1` | Region of the secret |

Outside debug mode Django also sets secure session/CSRF cookies, the HTTPS
redirect, HSTS, and `nosniff`. `/api/health/` is exempt from the redirect so load
balancers can probe it over HTTP.

### Same origin vs separate origins

The React app reads the `csrftoken` cookie with JavaScript and sends session
cookies with every request. The simplest working setup serves the app and the API
from **one origin** (a reverse proxy sends `/api/` to Django and everything else to
the React build). If they must be separate:

- Use sibling subdomains of one registrable domain (`app.` and `api.`), and set
  `DJANGO_COOKIE_DOMAIN=.example.com` so both can see the cookies.
- Build the frontend with `REACT_APP_API_URL=https://api.example.com/api`.
- Fully different domains would need `SameSite=None`; avoid that if you can.

## AWS Secrets Manager

Secrets are stored as **one JSON object** of `KEY: value` strings. Only these keys
are imported; anything else in the secret is ignored (and its name is logged):

`DJANGO_SECRET_KEY`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`,
`TOTP_ENCRYPTION_KEY`, `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

Create it (one time, by whoever owns the environment; do not paste values into chat
or commits):

```bash
aws secretsmanager create-secret \
  --name gooddriver/production \
  --secret-string file://secret.json   # delete secret.json afterwards
```

The runtime identity (EC2 instance profile, ECS task role, etc.) needs only:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:gooddriver/production-*"
  }]
}
```

The app never holds AWS keys: boto3 uses the role attached to the host. Locally,
leave `AWS_SECRETS_MANAGER_SECRET_ID` unset and keep using `.env`.

Notes:

- Secrets are read **once at startup**. After rotating one, restart the app.
- If the secret cannot be read, startup fails with a clear message; the app never
  runs half-configured.
- Changing `TOTP_ENCRYPTION_KEY` makes stored MFA seeds unreadable (see README).
- The application database user must be the restricted app user, not the RDS admin.

## Running in production

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3
python manage.py check --deploy      # should report no issues
```

Smoke test after every deploy: `GET /api/health/` returns `{"status": "ok"}`
(HTTP 200) when the database is reachable, 503 otherwise.

## Still open

- **Deploy target and workflow.** No hosting target has been chosen (EC2, Elastic
  Beanstalk, ECS/App Runner, ...), so there is no `deploy.yml` yet. CI lives in
  `.github/workflows/ci.yml`. The plan in `docs/PROJECT_TODO.md` (staging first,
  GitHub environments, OIDC to AWS) still applies.
- **Frontend hosting.** Build with `REACT_APP_API_URL` set, then host the static
  `frontend/build/` output (S3 + CloudFront, or the same server as the API).
- **Uploaded profile pictures.** Django serves `/media/` only in debug mode, and a
  container's disk is usually ephemeral. Profile pictures need object storage (for
  example S3 via `django-storages`) before production use.
- **Email and SMS providers.** The default console backends only print messages.
  Configure real SMTP/SES and Twilio values (via the secret) or password-reset and
  MFA emails will never reach users.
- **Rotation.** Document who owns each secret and how often it rotates.
