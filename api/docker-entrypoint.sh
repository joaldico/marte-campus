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

exec node dist/main.js
