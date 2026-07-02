#!/bin/sh
set -e

# Apply the schema (idempotent), then start the server.
npx drizzle-kit push --force
exec npx tsx server/index.ts
