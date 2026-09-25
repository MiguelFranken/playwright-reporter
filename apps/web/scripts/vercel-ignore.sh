#!/usr/bin/env bash
# Vercel's Ignored Build Step for apps/web: exit 0 skips the deployment, exit 1
# builds it. https://vercel.com/docs/project-configuration/project-settings#ignored-build-step
#
# Skips commits that touch nothing the app is built from, such as docs, other
# apps, agent skills or the CI config. Every workspace package is watched, not
# only the ones apps/web imports today, so a new dependency can never be
# missed; a reporter-only change builds once too often, which is the safe side.
#
# Migrations live under apps/web, so a skipped build never holds one back.
set -uo pipefail
cd "$(dirname "$0")/.."

# The commit of the last deployment of this branch, or the parent commit on a
# branch's first deployment.
base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

# Anything other than "no changes" (including a base missing from Vercel's
# shallow clone) builds.
if git diff --quiet "$base" HEAD -- . ../../packages ../../package.json ../../nub.lock ../../turbo.json; then
  echo "No changes to apps/web or its workspace since ${base}; skipping the build."
  exit 0
fi
echo "apps/web or its workspace changed since ${base}; building."
exit 1
