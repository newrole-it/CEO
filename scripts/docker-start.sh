#!/bin/sh
set -eu
npx prisma migrate deploy
npx tsx db/seed.ts
# Listen on all interfaces inside the container. Compose publishes 127.0.0.1:43123 only.
exec npx blitz start -H 0.0.0.0 -p 43123
