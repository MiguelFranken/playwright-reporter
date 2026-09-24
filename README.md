# Playwright Reporter

A self-hosted companion app for Playwright, modelled on [TestDino](https://docs.testdino.com/). A reporter
package streams every test run (from CI or a laptop) to a Next.js app that stores results in Postgres and
artifacts (screenshots, videos, traces, logs) in pluggable storage, shows runs **live** while they execute,
and keeps their history for debugging, flaky detection and analytics.

See [PROJECT.md](./PROJECT.md) for the product scope and
[PROJECT_TECHNICAL_DECISIONS.md](./PROJECT_TECHNICAL_DECISIONS.md) for the architecture.

## Repository layout

```
apps/web                  Next.js 16 app: auth, ingest API, live (SSE) endpoints, artifact serving,
                          and the feature components that bind @miguelfranken/ui to all of it
apps/website              The public marketing site: Next.js 16 + Payload CMS, rendering pages
                          from CMS blocks with components from @miguelfranken/ui/marketing
apps/storybook            Storybook 10 for @miguelfranken/ui: config only, no components of its own
packages/ui               The design system (@miguelfranken/ui): tokens, primitives, patterns, views,
                          and the marketing layer the website renders into.
                          Shipped as TypeScript source, no build step. Stories live beside
                          the components they describe and run as browser tests.
packages/protocol         Zod schemas of the ingest protocol (shared by reporter and app)
packages/reporter         Playwright reporter (@miguelfranken/reporter), bundled with tsdown/rolldown
packages/typescript-config
examples/playwright-demo  Example Playwright project using the reporter via workspace:*
```

The design system is documented in [STORYBOOK_DESIGN_SYSTEM.md](./STORYBOOK_DESIGN_SYSTEM.md);
its layering rules and the server/client boundary pitfalls are worth reading before adding a
component. To browse it:

```bash
pnpm turbo run dev --filter=@miguelfranken/storybook   # http://localhost:6006
```

Its stories run as tests in a real browser, with accessibility checks on every one:

```bash
pnpm --filter @miguelfranken/storybook exec playwright install chromium   # once
pnpm turbo run test --filter=@miguelfranken/storybook
```

## Requirements

- Node 24, pnpm 10
- A PostgreSQL database (Neon recommended). Two connection strings: a pooled one for the app
  and a direct one for migrations.

## Getting started (local)

```bash
pnpm install
```

Create `apps/web/.env.local` (see `apps/web/.env.example`):

```
DATABASE_URL=postgres://...            # pooled
DATABASE_URL_UNPOOLED=postgres://...   # direct, used by drizzle-kit migrate
BASE_URL=http://localhost:3000
BETTER_AUTH_SECRET=...                 # openssl rand -hex 32
SEED_SUPERADMIN_EMAIL=you@example.com
SEED_SUPERADMIN_PASSWORD=...           # optional; generated and printed once if omitted
STORAGE_DRIVER=local                    # or vercel-blob (+ BLOB_READ_WRITE_TOKEN)
```

Apply the schema, then create the first superadmin, the `default` team, the `default` project and an API
token. The seed prints the token (and the generated password, if any) once and, if
`examples/playwright-demo/.env` does not exist yet, writes the token there for you:

```bash
pnpm db:migrate
pnpm db:seed
```

Start the app (builds the packages first through Turborepo):

```bash
pnpm dev
```

Open http://localhost:3000, sign in with the seeded superadmin, and you land on the default project.
Then record a run with the example project:

```bash
pnpm --filter playwright-demo exec playwright install chromium firefox   # first time only
pnpm --filter playwright-demo test:e2e
```

The run appears under **Test Runs → Active runs** within a second or two and fills in as tests finish. The
example contains passing, failing, flaky, skipped, timing-out and visual-comparison tests plus custom
steps and attachments, so every page has something to show.

Sharded runs are merged into one run when the shards share a CI run id:

```bash
PW_REPORTER_CI_RUN_ID=my-run-1 pnpm --filter playwright-demo test:shard1 &
PW_REPORTER_CI_RUN_ID=my-run-1 pnpm --filter playwright-demo test:shard2
```

## Using the reporter in your own project

`@miguelfranken/reporter` is published to GitHub Packages. Point the scope at it in the project's `.npmrc`,
with a token that has `read:packages` and access to this repository:

```ini
@miguelfranken:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

```bash
pnpm add -D @miguelfranken/reporter
```

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [
    ['list'],
    ['@miguelfranken/reporter', { token: process.env.PW_REPORTER_TOKEN, serverUrl: process.env.PW_REPORTER_URL }],
  ],
});
```

| Option        | Env var                    | Notes                                                        |
| ------------- | -------------------------- | ------------------------------------------------------------ |
| `token`       | `PW_REPORTER_TOKEN`        | Project API token (project Settings → API tokens)            |
| `serverUrl`   | `PW_REPORTER_URL`          | Base URL of the app                                          |
| `ciRunId`     | `PW_REPORTER_CI_RUN_ID`    | Groups shards into one run; auto-detected on GitHub/GitLab   |
| `tags`        | `PW_REPORTER_TAGS`         | Comma-separated run tags                                     |
| `environment` | `PW_REPORTER_ENVIRONMENT`  | Label such as `staging`                                      |
| `artifacts`   | `PW_REPORTER_ARTIFACTS`    | `false` disables uploads                                     |
| `debug`       | `PW_REPORTER_DEBUG`        | Verbose logging                                              |
| `heartbeatIntervalMs` | `PW_REPORTER_HEARTBEAT_MS` | Sign of life while tests run, default `30000`; `0` disables |
| `git`         | `PW_REPORTER_GIT_BRANCH`, `_SHA`, `_MESSAGE`, `_REPO_URL`, `_AUTHOR` | The commit under test, where no CI variables or git checkout say it |
| `ci`          | `PW_REPORTER_CI_PROVIDER`, `PW_REPORTER_BUILD_URL`, `_BUILD_NUMBER`, `PW_REPORTER_CI_JOB` | The build that ran the tests, likewise |

Git and CI metadata (branch, commit, author, PR, build URL) are collected from Playwright's
`captureGitInfo`, CI environment variables and the local git checkout. A test image run outside CI (a
Kubernetes job, say) has none of those; set `git` / `ci` (or their env vars) and they win over detection.

When the tests run through Turborepo in strict env mode, list the `PW_REPORTER_*` variables in the task's
`passThroughEnv`, or turbo removes them before Playwright starts.

The reporter never fails a test run: network errors are retried and then logged.

## Abandoned runs

A reporter that dies mid-run (a killed process, a second Ctrl-C, a CI job cut off) never finishes its run.
Once a run has not heard from its reporter for 5 minutes (`RUN_STALE_TIMEOUT_MS`, clamped to 1–60 minutes;
a project may set `settings.staleTimeoutMs`), it reads as **Abandoned** (`incomplete`) everywhere. While tests
run, the reporter sends a heartbeat every 30 seconds, so a long test is not mistaken for a dead reporter. If
an abandoned run hears from its reporter again, it goes back to running.

Reads work the status out on the fly. A per-run **watchdog** also records it, settling open results and
telling open pages. The watchdog is a durable [Workflow SDK](https://workflow-sdk.dev) timer
(`apps/web/lib/runs/watchdog`) that sleeps until the run would go stale, checks, and sleeps again while the run
stays active. `RUN_WATCHDOG_DRIVER` picks the adapter:

| Deployment | Driver | Setup |
| --- | --- | --- |
| Vercel production | `workflow` (default) | none. Vercel runs the workflow |
| Vercel previews | `none` (default) | previews share the production database, so they do not start watchdogs |
| `next dev` | `workflow` (default) | none. Local world under `.next/workflow-data`; inspect with `npx workflow web` |
| Docker / Kubernetes | `workflow` | `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`, `WORKFLOW_POSTGRES_URL` (direct, not pooled), and `npx --package=@workflow/world-postgres bootstrap` once per database; each instance starts the worker in `instrumentation.ts` |

On the Postgres world, the worker polls the database twice a second, so a Neon compute behind it never scales
to zero.

## Releases

Every push to `main` runs [`release.yml`](.github/workflows/release.yml): after CI, semantic-release reads the
[Conventional Commits](https://www.conventionalcommits.org) since the last tag, publishes the reporter to GitHub
Packages, and commits the version bump and `CHANGELOG.md` back with a tag and a GitHub release. PRs are
squash-merged with their title as the commit message, so the title decides the release (`fix:` and `feat:`
bump the patch version while on 0.x, a breaking change the minor version). Run the workflow manually for a
dry run.

## Users and teams

Everything behind `/teams/...` requires a session. There is no self-registration: accounts are created
through an invitation link or by a superadmin.

**Roles.** A user has one *instance role* and one *team role* per team they belong to.

| Instance role | Can                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `superadmin`  | Everything in every team, plus `/admin`: create/delete teams, manage users, ban, set a temporary password, read the audit log |
| `user`        | Nothing outside their team memberships                                                            |

| Team role | Read | Project operations                                     | People                                  | Team            |
| --------- | ---- | ------------------------------------------------------ | --------------------------------------- | --------------- |
| `admin`   | yes  | all, including creating and deleting projects          | invite, remove, change role, revoke     | rename (deleting a team is superadmin-only) |
| `member`  | yes  | rename, manage ingest tokens, delete runs              | no                                      | no              |
| `viewer`  | yes, except the ingest tokens | no                                | no                                      | no              |

A team always keeps at least one admin: the last one cannot be demoted or removed (a superadmin can).

**Inviting somebody.** The app sends no email. Team settings → Members → **Invite** produces a link that
is shown **once**; hand it over yourself. The link is bound to one email, expires after 7 days
(`INVITATION_TTL_HOURS`) and can be used once. **New link** rotates it, **Revoke** cancels it. If the
person already has an account, **Add existing user** adds them straight away.

**Forgotten password.** No reset email yet: a superadmin opens `/admin/users`, clicks **Password**, and
hands over the temporary password shown once. The user changes it at `/account`.

**Isolation.** A team's URLs 404 for anyone outside it, rather than 403, so they do not reveal that
another team's project exists. Trace files are the one exception to cookie auth: `trace.playwright.dev`
fetches them cross-site, so trace links carry a short-lived HMAC signature
(`ARTIFACT_URL_TTL_SECONDS`, one hour by default) that grants access to that single artifact.

**Ingest is unchanged.** The reporter still authenticates with a per-project token, not a user session.

## Commands

```bash
pnpm build             # build all packages and the app
pnpm check-types       # tsc in every package
pnpm test              # unit tests only — fast, no database, no Docker
pnpm test:integration  # integration tests against a real PostgreSQL (needs Docker)
pnpm test:e2e          # example Playwright project (needs the app running)
pnpm db:generate       # create a migration from schema changes
pnpm db:studio         # drizzle studio
```

### Tests

Two Vitest projects, split by scope rather than by framework:

| | `unit` | `integration` |
| --- | --- | --- |
| Where | next to the module (`lib/**/*.test.ts`) | `apps/web/test/integration/` |
| Database | none — `DATABASE_URL` is a sentinel that cannot resolve, so an accidental query fails loudly | a real PostgreSQL, one database per test file |
| Command | `pnpm test` | `pnpm test:integration` |

The integration project starts a `postgres:17-alpine` container through Testcontainers, migrates a
template database once from `lib/db/migrations`, and gives every test file its own clone of it. Tables are
truncated before each test, so a test never sees another one's rows and nothing needs cleaning up
afterwards. Containers, databases and temp directories are removed on the way out, on success and on
failure alike.

Without Docker, point the suite at any throwaway server instead:

```bash
docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/postgres pnpm test:integration
```

`TEST_DATABASE_URL` is refused if it names the same database as `DATABASE_URL`: the suite creates,
truncates and drops databases on whatever it is given.

Both projects run together with `pnpm --filter @miguelfranken/web test:all`.

## Website

`apps/website` is the public marketing site (`WEBSITE.md`, `WEBSITE_TECHNICAL.md`). It is a second
Next.js app with [Payload CMS](https://payloadcms.com) inside it, sharing this repository's Postgres
database under its own `website` schema — so it needs no infrastructure of its own. Pages are built
from CMS blocks and rendered with the `marketing/` layer of `@miguelfranken/ui`, and the product demos on it
are the app's real views driven by the design system's fixtures.

```bash
cp apps/website/.env.example apps/website/.env.local   # then fill it in
pnpm --filter @miguelfranken/website db:migrate                 # creates the `website` schema
pnpm --filter @miguelfranken/website db:seed                    # admin, globals and the five pages
pnpm turbo run dev --filter=@miguelfranken/website              # http://localhost:3001, admin at /admin
```

Environment variables (`apps/website/.env.example`):

| Variable | What it is |
| --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | The same pair as `apps/web`. Migrations and the seed use the direct URL. |
| `BASE_URL` | The public origin. Payload's `serverURL`, and the base for canonical URLs, the sitemap and OG tags. |
| `PAYLOAD_SECRET` | Signs CMS sessions. `openssl rand -hex 32`, and **not** the same value as `BETTER_AUTH_SECRET`. |
| `PAYLOAD_SCHEMA` | The Postgres schema Payload owns. `website`. |
| `PREVIEW_SECRET` | Guards `/next/preview`, which also requires a signed-in CMS user. |
| `WEBSITE_BLOB_READ_WRITE_TOKEN` | A **public** Vercel Blob store, separate from the reporter's private artifact store. Empty in development, where uploads go to `apps/website/.media/`. |
| `SEED_WEBSITE_ADMIN_EMAIL`, `SEED_WEBSITE_ADMIN_PASSWORD` | The first CMS user. The password is generated and printed once when left empty. |

The screenshots the seed uploads are committed under `apps/website/payload/seed/screenshots/`.
Regenerate them when the interface changes:

```bash
pnpm turbo run build --filter=@miguelfranken/storybook
pnpm --filter @miguelfranken/website screenshots
pnpm --filter @miguelfranken/website db:seed --reset
```

CMS users are separate from the reporter's users: different auth system, different tables, different
schema. Editing a page and publishing it revalidates the affected paths, so content changes go live
without a deploy.

## Deploying to Vercel

1. Import the repo, set the Root Directory to `apps/web`. `apps/web/vercel.json` installs with nub and
   builds through `scripts/vercel-build.sh`, which runs the Turborepo build and then applies pending
   migrations — on **production** deployments only (previews share the production database).
2. Environment variables: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`,
   `STORAGE_DRIVER=vercel-blob` and a **private** Blob store connected to the project
   (`BLOB_READ_WRITE_TOKEN`). `BASE_URL` is optional: it defaults to the production domain (previews use
   their deployment URL). Extra domain aliases that should be able to sign in go in `TRUSTED_ORIGINS`.
3. Run `pnpm db:seed` once against the production database with `SEED_SUPERADMIN_EMAIL` (and optionally
   `SEED_VIEWER_EMAIL`) set to create the first accounts.

The website is a **second** Vercel project on the same repository: Root Directory `apps/website`,
build command `pnpm turbo run ci --filter=@miguelfranken/website` (which migrates before building), and a
**public** Blob store of its own. The two projects share the database and nothing else.

## Demo Accounts
- superadmin: miguel.franken@denkwerk.com / localdev-password-1
- demo member: viewer@example.com / invitee-password-1