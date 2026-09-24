#!/bin/sh
set -e

# Single-node deploy: run migrations at boot (idempotent, migration-locked by MySQL).
# When you move to multi-container [Upgrade paths], move this to a dedicated one-off job.
python manage.py migrate --noinput
python manage.py collectstatic --noinput --clear

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 2 --threads 4 \
  --timeout 60 \
  --access-logfile - --error-logfile -
