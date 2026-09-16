#!/bin/sh
set -e

has_sql=0
if [ -d prisma/migrations ]; then
  for f in prisma/migrations/*/*.sql; do
    if [ -f "$f" ]; then
      has_sql=1
      break
    fi
  done
fi

if [ "$has_sql" -eq 1 ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy
else
  echo "No Prisma SQL migrations found; skipping migrate deploy."
fi

echo "Seeding database..."
if ! npx prisma db seed; then
  echo "ERROR: prisma db seed failed" >&2
  exit 1
fi

exec node dist/main.js
