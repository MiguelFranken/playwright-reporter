#!/usr/bin/env bash
# Vercel build for apps/web (the project's root directory).
#
# Builds the app through Turborepo so the workspace packages it depends on are
# built first, then applies pending database migrations. Migrations run after a
# successful build, so a broken build never touches the schema, and only on
# production deployments: previews share the production database, and a branch
# must not migrate it before it is merged.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd ../.. && node_modules/.bin/turbo run build --filter=@repo/web)

if [ "${VERCEL_ENV:-}" = "production" ]; then
  node_modules/.bin/drizzle-kit migrate
else
  echo "Skipping database migrations (VERCEL_ENV=${VERCEL_ENV:-unset})"
fi
