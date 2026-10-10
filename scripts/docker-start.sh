#!/bin/sh
set -eu
npx prisma migrate deploy
npx tsx db/seed.ts
npx tsx src/worker.ts &
exec npx blitz start -H 0.0.0.0 -p 43123
