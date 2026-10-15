#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="salon-test-${RANDOM}-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
# Sem portas publicadas e sem rede: autenticação trust restrita ao container descartável.
docker run --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust -d postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < tests/db-bootstrap.sql
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202610150001_initial.sql
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < tests/database.sql
CONTAINER="$container" python3 tests/concurrency.py
