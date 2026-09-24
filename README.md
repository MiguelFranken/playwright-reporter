<h1 align="center">Playwright Reporter</h1>

<p align="center">
  Every Playwright run, live, in one place.<br>
  A reporter streams your test runs from CI or a laptop to a self-hosted Next.js app that shows them while they run,<br>
  keeps their history, screenshots, videos and traces, and tells you which tests are flaky, slow or broken.
</p>

<p align="center">
  <a href="https://github.com/MiguelFranken/playwright-reporter/releases"><img src="https://img.shields.io/github/v/release/MiguelFranken/playwright-reporter?color=2ead33&label=%40miguelfranken%2Freporter" alt="Latest release of @miguelfranken/reporter"></a>
  <a href="https://github.com/MiguelFranken/playwright-reporter/actions/workflows/release.yml"><img src="https://github.com/MiguelFranken/playwright-reporter/actions/workflows/release.yml/badge.svg" alt="Release workflow status"></a>
  <a href="https://github.com/MiguelFranken/playwright-reporter/actions/workflows/ci.yml"><img src="https://github.com/MiguelFranken/playwright-reporter/actions/workflows/ci.yml/badge.svg" alt="CI workflow status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/MiguelFranken/playwright-reporter?color=2ead33" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://playwright-reporter-nine.vercel.app">Live demo</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#using-the-reporter-in-your-project">Reporter</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#users-and-teams">Users &amp; teams</a> ·
  <a href="#deploying">Deploying</a> ·
  <a href="#contributing">Contributing</a>
</p>

<br>

- 🔴 **Live runs**: results, steps and attachments appear within a second or two, over server-sent events, while the
  tests are still running
- 🧩 **Sharding built in**: shards that share a CI run id are merged into one run, auto-detected on GitHub and GitLab
- 🎞️ **Every artifact**: screenshots, videos, logs and visual diffs next to the test, and traces that open straight in
  `trace.playwright.dev`
- 📈 **History and trends**: a dashboard per project, a page per test and per branch, with pass rates, durations and
  flaky tests over time
- 🌿 **Git and CI aware**: branch, commit, author, PR and build link from Playwright's `captureGitInfo`, CI variables
  or the checkout, with overrides for runs outside CI
- 🪦 **No zombie runs**: a run whose reporter died reads as *Abandoned*, recorded by a durable
  [Workflow SDK](https://workflow-sdk.dev) watchdog
- 🔔 **Push notifications**: the browser tells you when a run starts or finishes
- 👥 **Teams, roles and invitations**: superadmins, team admins, members and viewers; teams can't see each other's
  projects
- 🛡️ **Never fails your tests**: network errors are retried and then logged, the run goes on
- ☁️ **Runs anywhere**: Postgres (Neon recommended) and local or Vercel Blob storage; deploys to Vercel, Docker or
  Kubernetes

## Quick start

Requires Node.js 24, [nub](https://github.com/nubjs/nub) (both pinned in `mise.toml`) and a PostgreSQL database with
two connection strings: a pooled one for the app and a direct one for migrations.

```bash
nub install
cp apps/web/.env.example apps/web/.env.local   # then fill it in
```

```ini
# apps/web/.env.local
DATABASE_URL=postgres://...            # pooled
DATABASE_URL_UNPOOLED=postgres://...   # direct, used by drizzle-kit migrate
BASE_URL=http://localhost:3000
BETTER_AUTH_SECRET=...                 # openssl rand -hex 32
SEED_SUPERADMIN_EMAIL=you@example.com
SEED_SUPERADMIN_PASSWORD=...           # optional; generated and printed once if omitted
STORAGE_DRIVER=local                   # or vercel-blob (+ BLOB_READ_WRITE_TOKEN)
```

Apply the schema and seed the first superadmin, the `default` team and project, and an API token. The seed prints
the token (and the generated password, if any) once, and writes it to `examples/playwright-demo/.env` if that file
doesn't exist yet:

```bash
nub run db:migrate
nub run db:seed
nub run dev          # builds the packages through Turborepo, then http://localhost:3000
```

Sign in with the superadmin and record a run with the example project:

```bash
nub exec --filter playwright-demo playwright install chromium firefox   # first time only
nub run --filter playwright-demo test:e2e
```

The run shows up under **Test Runs → Active runs** and fills in as tests finish. The example has passing, failing,
flaky, skipped, timing-out and visual-comparison tests, custom steps and attachments, so every page has something to
show. To see two shards merged into one run:

```bash
PW_REPORTER_CI_RUN_ID=my-run-1 nub run --filter playwright-demo test:shard1 &
PW_REPORTER_CI_RUN_ID=my-run-1 nub run --filter playwright-demo test:shard2
```

## Using the reporter in your project

`@miguelfranken/reporter` is published to GitHub Packages. Point the scope at it with a token that has
`read:packages` and access to this repository:

```ini
# .npmrc
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
})
```

Create the token under project **Settings → API tokens**. That's it: the next run appears in the app.

## Configuration

Every option can also be set through its environment variable.

| Option | Env var | |
| --- | --- | --- |
| `token` | `PW_REPORTER_TOKEN` | the project API token |
| `serverUrl` | `PW_REPORTER_URL` | base URL of the app |
| `ciRunId` | `PW_REPORTER_CI_RUN_ID` | groups shards into one run; auto-detected on GitHub and GitLab |
| `tags` | `PW_REPORTER_TAGS` | comma-separated run tags |
| `environment` | `PW_REPORTER_ENVIRONMENT` | a label such as `staging` |
| `artifacts` | `PW_REPORTER_ARTIFACTS` | `false` disables uploads |
| `debug` | `PW_REPORTER_DEBUG` | verbose logging |
| `heartbeatIntervalMs` | `PW_REPORTER_HEARTBEAT_MS` | sign of life while tests run, `30000`; `0` disables |
| `git` | `PW_REPORTER_GIT_BRANCH`, `_SHA`, `_MESSAGE`, `_REPO_URL`, `_AUTHOR` | the commit under test, where no CI variables or checkout say it |
| `ci` | `PW_REPORTER_CI_PROVIDER`, `PW_REPORTER_BUILD_URL`, `_BUILD_NUMBER`, `PW_REPORTER_CI_JOB` | the build that ran the tests, likewise |

Git and CI metadata come from Playwright's `captureGitInfo`, CI environment variables and the local checkout. A test
image run outside CI (a Kubernetes job, say) has none of those; set `git` and `ci` and they win over detection.

> [!TIP]
> Running the tests through Turborepo in strict env mode? List the `PW_REPORTER_*` variables in the task's
> `passThroughEnv`, or turbo removes them before Playwright starts.

### Abandoned runs

A reporter that dies mid-run (a killed process, a second Ctrl-C, a CI job cut off) never finishes its run. Once a run
hasn't heard from its reporter for 5 minutes, it reads as **Abandoned** everywhere; if the reporter speaks up again,
it goes back to running. The heartbeat keeps a long test from being mistaken for a dead reporter.

| Setting | |
| --- | --- |
| `RUN_STALE_TIMEOUT_MS` | 5 minutes, clamped to 1–60; a project may override it with `settings.staleTimeoutMs` |
| `RUN_WATCHDOG_DRIVER` | `workflow` or `none`, see below |

Reads work the status out on the fly. A per-run watchdog also records it, settling open results and telling open
pages: a durable Workflow SDK timer (`apps/web/lib/runs/watchdog`) that sleeps until the run would go stale, checks,
and sleeps again while the run stays active.

| Deployment | Driver | Setup |
| --- | --- | --- |
| Vercel production | `workflow` (default) | none, Vercel runs the workflow |
| Vercel previews | `none` (default) | previews share the production database, so they start no watchdogs |
| `next dev` | `workflow` (default) | none; local world under `.next/workflow-data`, inspect with `npx workflow web` |
| Docker / Kubernetes | `workflow` | `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`, `WORKFLOW_POSTGRES_URL` (direct, not pooled), and `npx --package=@workflow/world-postgres bootstrap` once per database; each instance starts the worker in `instrumentation.ts` |

On the Postgres world, the worker polls the database twice a second, so a Neon compute behind it never scales to zero.

## Users and teams

Everything behind `/teams/...` requires a session, and there is no self-registration: accounts come from an
invitation link or a superadmin. A user has one instance role, and one team role per team they belong to.

| Instance role | Can |
| --- | --- |
| `superadmin` | everything in every team, plus `/admin`: create and delete teams, manage and ban users, set a temporary password, read the audit log |
| `user` | nothing outside their team memberships |

| Team role | Read | Project operations | People | Team |
| --- | --- | --- | --- | --- |
| `admin` | yes | all, including creating and deleting projects | invite, remove, change role, revoke | rename (deleting is superadmin-only) |
| `member` | yes | rename, manage ingest tokens, delete runs | no | no |
| `viewer` | yes, except the ingest tokens | no | no | no |

A team always keeps at least one admin: the last one can't be demoted or removed, except by a superadmin.

<details>
<summary><b>Invitations, passwords and isolation</b></summary>

<br>

- **Inviting somebody.** The app sends no email. Team settings → Members → **Invite** produces a link that is shown
  **once**; hand it over yourself. It is bound to one email, expires after 7 days (`INVITATION_TTL_HOURS`) and works
  once. **New link** rotates it, **Revoke** cancels it, and **Add existing user** adds somebody who already has an
  account straight away.
- **Forgotten password.** No reset email yet: a superadmin opens `/admin/users`, clicks **Password**, and hands over
  the temporary password shown once. The user changes it at `/account`.
- **Isolation.** A team's URLs 404 rather than 403 for anyone outside it, so they don't reveal that a project exists.
  Trace files are the one exception to cookie auth: `trace.playwright.dev` fetches them cross-site, so trace links
  carry a short-lived HMAC signature (`ARTIFACT_URL_TTL_SECONDS`, one hour) for that single artifact.
- **Ingest** authenticates with a per-project token, never with a user session.

</details>

## Deploying

### Vercel

1. Import the repository with Root Directory `apps/web`. `apps/web/vercel.json` installs with nub and builds through
   `scripts/vercel-build.sh`, which runs the Turborepo build and then applies pending migrations, on **production**
   deployments only (previews share the production database).
2. Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `STORAGE_DRIVER=vercel-blob` and connect a
   **private** Blob store (`BLOB_READ_WRITE_TOKEN`). `BASE_URL` defaults to the production domain, and previews use
   their deployment URL; extra domains that should be able to sign in go in `TRUSTED_ORIGINS`.
3. Run `nub run db:seed` once against the production database, with `SEED_SUPERADMIN_EMAIL` (and optionally
   `SEED_VIEWER_EMAIL`) set, to create the first accounts.

### Docker and Kubernetes

Run `apps/web` as a regular Next.js server, apply migrations with `nub run db:migrate`, and set
`RUN_WATCHDOG_DRIVER=workflow` with the Postgres world, see [Abandoned runs](#abandoned-runs).

## The marketing website

`apps/website` is the public site: a second Next.js app with [Payload CMS](https://payloadcms.com) inside it. It
shares the app's Postgres database under its own `website` schema, so it needs no infrastructure of its own. Pages
are built from CMS blocks and rendered with the `marketing/` layer of `@miguelfranken/ui`, and the product demos on
it are the app's real views, driven by the design system's fixtures.

```bash
cp apps/website/.env.example apps/website/.env.local        # then fill it in
nub run --filter @miguelfranken/website db:migrate          # creates the `website` schema
nub run --filter @miguelfranken/website db:seed             # admin, globals and the pages
nub exec turbo run dev --filter=@miguelfranken/website      # http://localhost:3001, admin at /admin
```

<details>
<summary><b>Website environment variables, screenshots and deployment</b></summary>

<br>

| Variable | |
| --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | the same pair as `apps/web`; migrations and the seed use the direct URL |
| `BASE_URL` | the public origin: Payload's `serverURL`, and the base for canonical URLs, the sitemap and OG tags |
| `PAYLOAD_SECRET` | signs CMS sessions; `openssl rand -hex 32`, and **not** the same as `BETTER_AUTH_SECRET` |
| `PAYLOAD_SCHEMA` | the Postgres schema Payload owns: `website` |
| `PREVIEW_SECRET` | guards `/next/preview`, which also requires a signed-in CMS user |
| `WEBSITE_BLOB_READ_WRITE_TOKEN` | a **public** Vercel Blob store, separate from the app's private one; empty in development, where uploads go to `apps/website/.media/` |
| `SEED_WEBSITE_ADMIN_EMAIL`, `SEED_WEBSITE_ADMIN_PASSWORD` | the first CMS user; the password is generated and printed once when empty |

The screenshots the seed uploads live in `apps/website/payload/seed/screenshots/`. Regenerate them when the interface
changes:

```bash
nub exec turbo run build --filter=@miguelfranken/storybook
nub run --filter @miguelfranken/website screenshots
nub run --filter @miguelfranken/website db:seed --reset
```

CMS users are separate from the app's users: a different auth system, different tables, a different schema.
Publishing a page revalidates the affected paths, so content changes go live without a deploy.

On Vercel, the website is a **second** project on the same repository: Root Directory `apps/website`, build command
`nub exec turbo run ci --filter=@miguelfranken/website` (which migrates before building), and a **public** Blob store
of its own. The two projects share the database and nothing else.

</details>

## Repository layout

| Path | |
| --- | --- |
| [`apps/web`](apps/web) | Next.js 16 app: auth, ingest API, live (SSE) endpoints, artifact serving, and the feature components that bind the design system to them |
| [`apps/website`](apps/website) | the marketing site: Next.js 16 and Payload CMS |
| [`apps/storybook`](apps/storybook) | Storybook 10 for the design system; config only, no components of its own |
| [`packages/reporter`](packages/reporter) | the Playwright reporter, `@miguelfranken/reporter`, bundled with tsdown |
| [`packages/protocol`](packages/protocol) | Zod schemas of the ingest protocol, shared by the reporter and the app |
| [`packages/ui`](packages/ui) | the design system, `@miguelfranken/ui`: tokens, primitives, patterns, views and the marketing layer; TypeScript source, no build step |
| [`examples/playwright-demo`](examples/playwright-demo) | a Playwright project that uses the reporter through `workspace:*` |

## Contributing

```bash
nub run build              # every package and both apps
nub run check-types        # tsc everywhere
nub run test               # unit tests: fast, no database, no Docker
nub run test:integration   # against a real PostgreSQL (needs Docker)
nub run test:e2e           # the example Playwright project (needs the app running)
nub run db:generate        # a migration from schema changes
nub run db:studio          # drizzle studio
```

The design system's stories run as tests in a real browser, with accessibility checks on every one:

```bash
nub exec turbo run dev --filter=@miguelfranken/storybook                  # http://localhost:6006
nub exec --filter @miguelfranken/storybook playwright install chromium        # once
nub exec turbo run test --filter=@miguelfranken/storybook
```

<details>
<summary><b>How the tests are set up</b></summary>

<br>

Two Vitest projects, split by scope rather than by framework:

| | `unit` | `integration` |
| --- | --- | --- |
| Where | next to the module (`lib/**/*.test.ts`) | `apps/web/test/integration/` |
| Database | none; `DATABASE_URL` is a sentinel that can't resolve, so an accidental query fails loudly | a real PostgreSQL, one database per test file |
| Command | `nub run test` | `nub run test:integration` |

The integration project starts a `postgres:17-alpine` container through Testcontainers, migrates a template database
once from `lib/db/migrations`, and gives every test file its own clone. Tables are truncated before each test, so a
test never sees another one's rows, and containers, databases and temp directories are removed afterwards, on
success and failure alike.

Without Docker, point the suite at any throwaway server:

```bash
docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/postgres nub run test:integration
```

`TEST_DATABASE_URL` is refused if it names the same database as `DATABASE_URL`: the suite creates, truncates and
drops databases on whatever it is given. Both projects run together with
`nub run --filter @miguelfranken/web test:all`.

</details>

### Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org), and every push to `main` releases
automatically: after CI, [`release.yml`](.github/workflows/release.yml) runs semantic-release, publishes the reporter
to GitHub Packages, and commits the version bump and [`CHANGELOG.md`](CHANGELOG.md) back with a tag and a GitHub
release. PRs are squash-merged with their title as the commit message, so the title decides the release (`fix:` and
`feat:` bump the patch version while on 0.x, a breaking change the minor version). Run the workflow manually for a
dry run.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| superadmin | miguel.franken@denkwerk.com | `localdev-password-1` |
| member | viewer@example.com | `invitee-password-1` |

## License

[MIT](LICENSE) © Miguel Franken
