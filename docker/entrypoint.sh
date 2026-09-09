#!/bin/sh
set -e
cd /app
ROLE="${1:-web}"
if [ "$ROLE" = "web" ]; then
  echo "[srpanel] applying database schema..."
  npx prisma db push --schema packages/db/prisma/schema.prisma --skip-generate --accept-data-loss
  echo "[srpanel] starting web on :${PORT:-3000}"
  exec npm run start -w apps/web
else
  echo "[srpanel] starting worker"
  sleep 5
  exec npm run start -w apps/worker
fi
