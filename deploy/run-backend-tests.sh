#!/usr/bin/env bash
# Runs the backend API tests inside Docker against a throwaway PostgreSQL container.
# It never touches the real stack, its network or its volume.
# Usage (from the project root):  bash deploy/run-backend-tests.sh
set -euo pipefail

NET=clf-test-net
DB=clf-test-db
cleanup() {
  sudo docker rm -f "$DB" >/dev/null 2>&1 || true
  sudo docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

sudo docker network create "$NET" >/dev/null
sudo docker run -d --name "$DB" --network "$NET" \
  -e POSTGRES_DB=clf_test -e POSTGRES_USER=clf_test -e POSTGRES_PASSWORD=clf_test_only \
  postgres:17-alpine >/dev/null

echo "Waiting for the test database..."
until sudo docker exec "$DB" pg_isready -U clf_test -d clf_test >/dev/null 2>&1; do sleep 1; done
sleep 2

sudo docker run --rm --network "$NET" \
  -v "$PWD/backend:/src:ro" \
  -e DB_HOST="$DB" -e POSTGRES_DB=clf_test -e POSTGRES_USER=clf_test -e POSTGRES_PASSWORD=clf_test_only \
  -e ALLOW_TEST_DB_RESET=yes \
  node:24-alpine sh -c "cp -r /src /work && cd /work && npm ci --no-audit --no-fund --loglevel=error && npm test"
