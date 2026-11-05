#!/bin/sh
set -e
# Migrations + super admin uniquement pour le service API (pas pour le worker).
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  alembic upgrade head
  python -m app.cli bootstrap
fi
exec "$@"
