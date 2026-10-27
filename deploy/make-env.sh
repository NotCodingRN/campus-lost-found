#!/usr/bin/env bash
# Creates .env from .env.example with random database password and session secret.
# Usage (project root):  bash deploy/make-env.sh <APP_PORT>      e.g. bash deploy/make-env.sh 8046
# Refuses to overwrite an existing .env. Prints no secret values.
set -euo pipefail

PORT="${1:-8080}"
if [ -f .env ]; then
  echo ".env already exists; not overwriting it." >&2
  exit 1
fi

DB_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"

umask 077
sed \
  -e "s|^APP_PORT=.*|APP_PORT=${PORT}|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASSWORD}|" \
  -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" \
  -e "s|^GOOGLE_CALLBACK_URL=.*|GOOGLE_CALLBACK_URL=http://localhost:${PORT}/api/auth/google/callback|" \
  .env.example > .env

echo "Created .env (APP_PORT=${PORT}, random DB password and session secret, permissions 600)."
echo "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env to enable sign-in."
