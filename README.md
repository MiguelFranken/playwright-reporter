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
  <a href="https://playwright-reporter-nine.vercel.app/demo"><b>Live demo</b></a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#using-the-reporter-in-your-project">Reporter</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#artifact-storage">Storage</a> ·
  <a href="#users-and-teams">Users &amp; teams</a> ·
  <a href="#ai-assistants-mcp">AI assistants</a> ·
  <a href="#rest-api">REST API</a> ·
  <a href="#deploying">Deploying</a> ·
  <a href="#contributing">Contributing</a>
</p>

<br>

- 🔴 **Live runs**: results, steps and attachments appear within a second or two, over server-sent events, while the
  tests are still running
- 🧩 **Sharding built in**: shards that share a CI run id are merged into one run, auto-detected on GitHub and GitLab
- 🎞️ **Every artifact**: screenshots, videos, logs and visual diffs next to the test, and traces in Playwright's
  Trace Viewer, embedded and served by the app itself (no third party, works behind a VPN)
- 📈 **History and trends**: a dashboard per project, a page per test and per branch, with pass rates, durations and
  flaky tests over time
- 🌿 **Git and CI aware**: branch, commit, author, PR and build link from Playwright's `captureGitInfo`, CI variables
  or the checkout, with overrides for runs outside CI
- 🪦 **No zombie runs**: a run whose reporter died reads as *Abandoned*, recorded by a durable
  [Workflow SDK](https://workflow-sdk.dev) watchdog
- 🔔 **Push notifications**: the browser tells you when a run starts or finishes
- 🤖 **AI assistants over MCP**: Claude, Cursor, Copilot, ChatGPT and friends read your test history, debug failures
  with evidence (flaky or broken, last green commit, screenshot) and check whether a fix held
- 🔌 **A REST API**: runs, results, tests and the same verdicts as MCP, read-only, with an OpenAPI 3.1 description
- 👥 **Teams, roles and invitations**: superadmins, team admins, members and viewers; teams can't see each other's
  projects
- 🛡️ **Never fails your tests**: network errors are retried and then logged, the run goes on
- ☁️ **Runs anywhere**: Postgres (Neon recommended) and the local filesystem, Vercel Blob or any S3-compatible bucket
  (AWS S3, Cloudflare R2, MinIO, …) for artifacts; deploys to Vercel, Docker or Kubernetes

> [!TIP]
> **[Open the live demo](https://playwright-reporter-nine.vercel.app/demo)**: no sign-up, you are signed in as a
> read-only viewer. Its runs are real: a scheduled workflow runs a web shop's suite every two hours, with
> flaky tests, regressions that get fixed, and feature branches that come and go. See [The live demo](#the-live-demo).

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
STORAGE_DRIVER=local                   # or vercel-blob, or s3, see Artifact storage
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
| `git.prNumber`, `.prUrl`, `.prTitle` | `PW_REPORTER_PR_NUMBER`, `_URL`, `_TITLE` | the pull or merge request, likewise; detected on GitHub and GitLab, and the link is derived from the repository when only the number is known |
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

### Artifact storage

Screenshots, videos, traces and avatars go to one of three stores, chosen with `STORAGE_DRIVER`:

| Driver | For | Uploads | Setup |
| --- | --- | --- | --- |
| `local` | development, a single server with a persistent volume | through the app (`PUT /api/ingest/uploads/:id`) | `STORAGE_LOCAL_DIR`, default `.storage` |
| `vercel-blob` | Vercel | presigned, straight to Blob | a **private** Blob store, `BLOB_READ_WRITE_TOKEN` |
| `s3` | Docker, Kubernetes, anywhere with a bucket | presigned, straight to the bucket | `S3_BUCKET` and the settings below |

Without `STORAGE_DRIVER` the app uses `vercel-blob` on Vercel and `local` everywhere else. With a presigned driver
the reporter PUTs each artifact to the store itself, so no artifact passes through the app and there is no request
size limit. Media the browser plays itself (videos, screenshots) is read from a short-lived presigned URL the same
way, which gives video seeking real range requests. Downloads and traces stream through the app, which adds the
file name and the CORS headers `trace.playwright.dev` needs. Switching drivers doesn't move existing artifacts: they
stay in the old store, and old runs show them as missing.

#### S3 and S3-compatible stores

`STORAGE_DRIVER=s3` works with AWS S3 and with any store that speaks its API: Cloudflare R2, MinIO, Hetzner Object
Storage, DigitalOcean Spaces, Neon Object Storage and others.

| Env var | |
| --- | --- |
| `S3_BUCKET` | the bucket; required |
| `S3_REGION` | e.g. `eu-central-1`, `auto` for R2; falls back to `AWS_REGION`, then `us-east-1` |
| `S3_ENDPOINT` | the store's API endpoint; unset for AWS |
| `S3_FORCE_PATH_STYLE` | `true` for `https://endpoint/bucket/key` URLs, which MinIO and most self-hosted stores need |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_SESSION_TOKEN` | static credentials; leave them unset to use the AWS default credential chain (an IAM role, IRSA / EKS Pod Identity, `AWS_PROFILE`, …) |
| `S3_KEY_PREFIX` | stores every object under this prefix, e.g. `reporter/production`, so several deployments can share a bucket |
| `S3_RETENTION` | who deletes expired artifacts: `app` (default) or `lifecycle`, see [Artifact retention](#artifact-retention) |

```ini
# AWS S3, credentials from the pod's IAM role
STORAGE_DRIVER=s3
S3_BUCKET=acme-playwright-artifacts
S3_REGION=eu-central-1

# Cloudflare R2
STORAGE_DRIVER=s3
S3_BUCKET=playwright-artifacts
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...

# MinIO
STORAGE_DRIVER=s3
S3_BUCKET=playwright-artifacts
S3_ENDPOINT=https://minio.internal.example.com
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

The bucket stays **private**; every read goes through a presigned URL or the app. The reporter uploads from wherever
your tests run and browsers read media from wherever your users are, so `S3_ENDPOINT` must be reachable from both,
not only from the app. No bucket CORS rule is needed: uploads come from Node, not a browser, and the browser only loads
media through `<img>` and `<video>`. On AWS the app needs this policy on the bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::acme-playwright-artifacts/*" },
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::acme-playwright-artifacts" }
  ]
}
```

`s3:ListBucket` lets S3 answer `404` for an object that is not there instead of `403`, which is how the app tells a
missing upload from a denied one. With `S3_RETENTION=lifecycle`, add `s3:PutObjectTagging` on the objects and
`s3:GetLifecycleConfiguration` and `s3:PutLifecycleConfiguration` on the bucket.

The adapter lives in `apps/web/lib/storage/s3.ts`. It runs against a real S3 API in the integration tests, see
[How the tests are set up](#contributing).

### Artifact retention

Screenshots, videos and traces of failing tests fill the store quickly. Superadmins set how long they are kept
under **Administration → Storage**: a lifetime in days, counted from the upload, and optionally a
shorter one per kind. Videos and traces are the big ones. Retention is **off** until somebody turns it on, so an
upgrade never deletes anything by itself. A deployment can opt in with `ARTIFACT_RETENTION_DAYS` until a policy is
saved in the UI.

A **sweep** applies the policy (`apps/web/lib/storage/retention`). It deletes expired objects from the store in
batches and marks their rows `expired`. The run keeps every result, error, step and the artifact's name and size.
Its page shows the artifact as expired, and `/api/artifacts/:id` answers `410 Gone` instead of a broken link.
Sweeps may overlap safely: each batch locks its rows with `skip locked`. A failed store delete rolls its batch back
for the next sweep. These start a sweep:

| Trigger | Where | Setup |
| --- | --- | --- |
| Scheduler | Vercel Cron, daily at 03:17 UTC (`apps/web/vercel.json`, production only) | set `CRON_SECRET` in the project |
| Scheduler | Docker / Kubernetes: any cron calling `GET /api/cron/artifact-retention` with `Authorization: Bearer $CRON_SECRET` | set `CRON_SECRET` |
| A finished run | anywhere but Vercel previews, when no sweep started in the last 12 hours | none; `ARTIFACT_RETENTION_INGEST_SWEEP=off` turns it off |
| Run now | the button on the admin page | none |

Each storage adapter says who deletes expired objects (`StorageAdapter.retention`). The filesystem and Vercel
Blob have no lifecycle rules, so the app deletes objects itself (`app`). A store with its own lifecycle rules
declares `provider`. The sweep then only marks rows by the same lifetimes and deletes nothing. An object found
missing on first read is also marked expired. Such an adapter can implement `applyRetentionPolicy` to push the
saved policy to the store. The save fails if that call fails, so the two never silently disagree.

The S3 driver does either:

- `S3_RETENTION=app` (default): the sweep deletes expired objects with `DeleteObjects`, like on the other drivers.
  It works on every S3-compatible store.
- `S3_RETENTION=lifecycle`: the bucket expires objects itself. Every upload is tagged with its kind
  (`pwr-kind=video`), and saving the policy writes one lifecycle rule per kind (`pwr-retention-<kind>`) that
  expires objects with that tag after the configured days. Rules the app didn't write are kept; turning retention
  off removes only its own. The store must support lifecycle rules with tag filters, as AWS S3 and MinIO do; on
  others keep `app`. Objects uploaded before the switch carry no tag, so no rule expires them. Avatars are never
  tagged and never expire.

### Data retention

Run history grows the database with every run: each result carries its attempts, steps, errors and logs, and
the live event log records every step of a run in progress. Superadmins set how long it is kept under
**Administration → Database**, separately from the artifact policy. The page also shows how full the database is
(size by table, what one result costs, the growth at the current rate), how much was ingested per day or week, the
projects holding the most rows, and what the saved policy would delete next. Like artifact retention it is **off**
until somebody turns it on; `DATA_RETENTION_DAYS` opts a deployment in until a policy is saved.

A **sweep** (`apps/web/lib/data-retention`) applies the policy, in batches and within a time budget:

1. Finished runs that started longer ago than the run lifetime are deleted with everything under them — except the
   newest few of every project, however old, so a quiet project keeps its history. Their live artifacts are deleted
   from the store in the same transaction; a failing store rolls the batch back. Runs in progress are never touched,
   and run numbers keep counting up.
2. Tests no run refers to any more are removed from the catalogue.
3. The live event log of finished runs goes after a few days (7 by default): it only feeds the live views.
4. Audit entries go after their lifetime, when one is set. By default the audit log is kept forever.
5. Housekeeping: sessions, verifications, OAuth codes and tokens and unaccepted invitations a week past their
   expiry, idle rate-limit rows, and sweep logs older than 180 days.

Deleting a run deletes its artifacts too, so the run lifetime caps the artifact lifetime; the policy form says so
when it is shorter. Postgres reuses the space of deleted rows, so the database stops growing rather than shrinking
on disk. **Purge history** deletes every finished run at once, whatever the policy says; teams, projects, members
and tokens stay.

| Trigger | Where | Setup |
| --- | --- | --- |
| Scheduler | Vercel Cron, daily at 03:47 UTC (`apps/web/vercel.json`, production only) | set `CRON_SECRET` in the project |
| Scheduler | Docker / Kubernetes: any cron calling `GET /api/cron/data-retention` with `Authorization: Bearer $CRON_SECRET` | set `CRON_SECRET` |
| A finished run | anywhere but Vercel previews, when no data sweep started in the last 12 hours | none; `DATA_RETENTION_INGEST_SWEEP=off` turns it off |
| Run now | the button on the admin page | none |

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
  The Trace Viewer is served by the app under `/trace/` (copied from `playwright-core` at build time), so it loads
  traces same-origin with the session cookie. Only links for callers without one (MCP clients,
  `npx playwright show-trace`) carry a short-lived HMAC signature for that single artifact.
- **Ingest** authenticates with a per-project token, never with a user session.

</details>

## AI assistants (MCP)

The app runs a [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp`. An assistant in your
editor or browser can then answer "why is the checkout test red on my branch?" from the stored runs, not from a
pasted stack trace: which attempts failed and how, whether the test is flaky or broken, the last green commit, the
screenshot, and the command to re-run it. It reads as the person who connected it, never more than they can see, and
it cannot change anything.

**Connecting.** Everything below is also on **Account → AI assistants**, pre-filled with your instance's URL.

- **Token-based** (Claude Code, Cursor, VS Code, Windsurf, Codex): create a personal access token under
  **Account → Access tokens** (read-only, always expires, optionally limited to one team or project), then:

  ```bash
  claude mcp add --transport http playwright-reporter 'https://reporter.example.com/api/mcp' \
    --header 'Authorization: Bearer pwr_pat_…'
  ```

  Add `?project=team/project` to the URL to pin a default project.
- **Sign-in based** (claude.ai, ChatGPT, Claude Code without `--header`): add the URL as a custom connector. The
  assistant opens the app, you choose which teams or project it may read, and it gets a short-lived token. Connected
  apps are listed, and can be disconnected, under **Account → Connected apps**.
- **Local only** (Claude Desktop's config file, older clients): the [`@miguelfranken/mcp`](packages/mcp) bridge
  speaks stdio and forwards to the instance; it picks the project from your checkout's git remote.

**Tools.** Sixteen read-only tools in two toolsets; the full reference, generated from the code, is
[`docs/mcp-tools.md`](docs/mcp-tools.md).

| Toolset | Tools |
| --- | --- |
| `core` | `whoami`, `list_filters`, `list_runs`, `get_run`, `list_run_results`, `get_result`, `find_tests`, `get_test_history`, `project_health` |
| `debug` | `get_failure_context` (start here for a failing test), `check_flakiness`, `summarize_failures`, `compare_runs`, `verify_fix`, `get_artifact`, `get_rerun_command` |

Verdicts (flaky, deterministic, fixed, …) are computed from the stored attempts, not guessed by a model, and say
which fixes the evidence rules out. Clients with slash commands also get the prompts `triage_run`, `debug_test`,
`investigate_flake` and `branch_check`. Failed results and runs carry a **Debug with AI** menu that hands a prompt to
your assistant.

**Operating it.**

| Setting | |
| --- | --- |
| `MCP_ENABLED` | `false` switches the server off; superadmins can also switch it off under **Administration → MCP** |
| `MCP_DEFAULT_TOOLSETS` | `core,debug`; a connection can ask for fewer with `?toolsets=core` |
| `MCP_RESPONSE_BUDGET_CHARS` | characters per answer before it is trimmed (with a notice), `20000` |
| `MCP_RATE_LIMIT_PER_MINUTE` | tool calls per token, `120` |
| `MCP_ARTIFACT_URL_TTL_SECONDS` | lifetime of the artifact links handed to assistants, `900` |
| `MCP_INLINE_IMAGE_MAX_BYTES` | largest screenshot returned inline, `1048576` |
| `MCP_ALLOWED_HOSTS` | extra `Host` values behind a reverse proxy; `BASE_URL` and `TRUSTED_ORIGINS` are always allowed |
| `PAT_DEFAULT_TTL_DAYS`, `PAT_MAX_TTL_DAYS` | token lifetime offered and allowed, `90` and `365` days |

> [!NOTE]
> Test titles, error messages and logs are written by the code under test. The server hands them to the assistant
> fenced and labelled as untrusted, and tells it never to follow instructions found in them.

<details>
<summary><b>Troubleshooting</b></summary>

<br>

- **401 "project ingest token"**: MCP needs a personal access token (`pwr_pat_…`), not the reporter's `pwr_…` token.
- **401 "invalid, expired or revoked"**: tokens always expire; create a new one under Account → Access tokens.
- **`PROJECT_REQUIRED`**: you can read several projects; pass `project` as `team/project` or pin one in the URL.
- **`NOT_FOUND`** means "not found *or* not visible to you", like the app's 404s.
- **`ARTIFACT_EXPIRED`**: the retention policy deleted the screenshot or trace; re-run the test.
- **The client lists no tools**: restart it, or check `whoami` and **Administration → MCP**.
- **The bridge cannot be installed**: it is published to GitHub Packages like the reporter; see the `.npmrc` step above.

</details>

## REST API

Every instance serves a read-only REST API under `/api/v1`, authenticated with the same personal access tokens as the
MCP server (**Account → Access tokens**):

```bash
curl -H "Authorization: Bearer pwr_pat_…" \
  "https://reporter.example.com/api/v1/projects/acme/web/runs?status=failed&limit=5"
```

Its endpoints are the MCP tools over HTTP (runs, results, tests, failure groups, run diffs, flakiness verdicts, fix
verification, re-run commands) and answer from the same code, so both see the same data and give the same verdicts.
Errors are RFC 9457 problem details with the MCP error codes, lists page with `limit` and `nextCursor`, and the
per-token rate limit is shared with MCP (`MCP_RATE_LIMIT_PER_MINUTE`). The instance describes itself at
`/api/v1/openapi.json`. The document is generated from the router in `apps/web/lib/api` (`nub run api:docs` in
`apps/web`) and committed as [`docs/openapi.json`](docs/openapi.json); a unit test fails when it drifts, and CI fails a
pull request that breaks it. The [docs site](apps/docs) renders it as the API reference.

## Deploying

### Vercel

1. Import the repository with Root Directory `apps/web`. `apps/web/vercel.json` installs with nub and builds through
   `scripts/vercel-build.sh`, which runs the Turborepo build and then applies pending migrations, on **production**
   deployments only (previews share the production database).
2. Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `STORAGE_DRIVER=vercel-blob` and connect a
   **private** Blob store (`BLOB_READ_WRITE_TOKEN`). `BASE_URL` defaults to the production domain, and previews use
   their deployment URL; extra domains that should be able to sign in go in `TRUSTED_ORIGINS`. Set `CRON_SECRET`
   (`openssl rand -hex 32`) so the daily [artifact](#artifact-retention) and [data retention](#data-retention) crons
   are accepted.
3. Run `nub run db:seed` once against the production database, with `SEED_SUPERADMIN_EMAIL` (and optionally
   `SEED_VIEWER_EMAIL`) set, to create the first accounts.

### Docker and Kubernetes

Run `apps/web` as a regular Next.js server, apply migrations with `nub run db:migrate`, and set
`RUN_WATCHDOG_DRIVER=workflow` with the Postgres world, see [Abandoned runs](#abandoned-runs). Keep artifacts in a
bucket (`STORAGE_DRIVER=s3`, see [Artifact storage](#artifact-storage)), so every replica sees the same files and
none of them needs a persistent volume. Artifact and data retention need nothing more: a finished run starts a sweep
when none ran for 12 hours. For a fixed schedule, set `CRON_SECRET` and call `/api/cron/artifact-retention` and
`/api/cron/data-retention` from a CronJob, see [Artifact retention](#artifact-retention) and
[Data retention](#data-retention).

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

## The live demo

[`/demo`](https://playwright-reporter-nine.vercel.app/demo) signs a visitor in, without a password, as the account
`DEMO_USER_EMAIL` names, and lands on `DEMO_LANDING_PATH`. That account has to be a plain user who is a `viewer` in
every team it is in, or `/demo` is a 404, and it can't change its name, password or avatar or list its sessions,
since every visitor shares it. Somebody who is signed in already stays signed in as themselves.

Its data comes from [`examples/demo-shop`](examples/demo-shop): the Acme web shop and a Playwright suite for it,
desktop and mobile. [`demo.yml`](.github/workflows/demo.yml) runs the suite every two hours for the branches
[`schedule.ts`](examples/demo-shop/schedule.ts) plans for that slot. `main` runs in two shards and is mostly green,
apart from a regression now and then that gets fixed a day later, and a new feature branch opens every three days,
some of them broken until their last commit. A scenario sets the shop's latencies and bugs, so flaky tests are
genuinely flaky and failures come with real screenshots, videos and traces.

<details>
<summary><b>Setting it up on an instance</b></summary>

<br>

1. Create the team, the project and the demo viewer, and note the API token the seed prints:
   ```bash
   SEED_TEAM_SLUG=acme SEED_TEAM_NAME=Acme SEED_PROJECT_SLUG=web-shop SEED_PROJECT_NAME="Web shop" \
   SEED_VIEWER_EMAIL=viewer@example.com nub run --filter @miguelfranken/web db:seed
   ```
2. Set `DEMO_USER_EMAIL=viewer@example.com` and `DEMO_LANDING_PATH=/teams/acme/projects/web-shop/dashboard` on the
   app.
3. In the repository, set the variable `DEMO_REPORTER_URL` and the secret `DEMO_REPORTER_TOKEN`.
4. Run **Live demo** with `backfill_days: 30` once. It records every scenario through the real reporter and replays
   the recordings over the past 30 days, oldest first, so the time filters have something to show from day one.
5. Set the variable `DEMO_ENABLED=true` to start the schedule.

</details>

## Repository layout

| Path | |
| --- | --- |
| [`apps/web`](apps/web) | Next.js 16 app: auth, ingest API, live (SSE) endpoints, the REST API (`/api/v1`) and the UI's own RPC API (`/api/rpc`, through TanStack Query), artifact serving, and the feature components that bind the design system to them |
| [`apps/website`](apps/website) | the marketing site: Next.js 16 and Payload CMS |
| [`apps/docs`](apps/docs) | the documentation site: Next.js 16 and Fumadocs, with the REST API reference, `llms.txt` and an MCP endpoint |
| [`apps/storybook`](apps/storybook) | Storybook 10 for the design system; config only, no components of its own |
| [`packages/reporter`](packages/reporter) | the Playwright reporter, `@miguelfranken/reporter`, bundled with tsdown |
| [`packages/mcp`](packages/mcp) | the stdio bridge to the MCP server, `@miguelfranken/mcp`, for clients that only start local servers |
| [`packages/protocol`](packages/protocol) | Zod schemas of the ingest protocol, shared by the reporter and the app |
| [`packages/ui`](packages/ui) | the design system, `@miguelfranken/ui`: tokens, primitives, patterns, views and the marketing layer; TypeScript source, no build step |
| [`examples/playwright-demo`](examples/playwright-demo) | a Playwright project that uses the reporter through `workspace:*` |
| [`examples/demo-shop`](examples/demo-shop) | the Acme web shop and its suite, which feed the live demo |

## Contributing

```bash
nub run build              # every package and both apps
nub run check-types        # tsc everywhere
nub run test               # unit tests: fast, no database, no Docker
nub run test:integration   # against a real PostgreSQL and an S3 stub (needs Docker)
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
| Storage | the local driver in a temp directory; the S3 adapter with its network calls stubbed | the local driver, and S3 on RustFS for the S3 suites, one bucket per test file |
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
drops databases on whatever it is given.

The S3 driver is tested against [RustFS](https://github.com/rustfs/rustfs), an Apache-2.0 S3-compatible server, so
no test ever needs an AWS account or bucket. It's the approach Payload takes for its storage adapters, which used
LocalStack; LocalStack's open-source edition has since been archived. RustFS passes the whole S3 suite, checks
request signatures the way S3 does, and supports the object tags and lifecycle rules that `S3_RETENTION=lifecycle`
relies on. The integration run starts the container through Testcontainers (`test/integration/s3-global-setup.ts`),
and each S3 test file creates its own bucket and empties it between tests. The checks look into the bucket itself:
- presigned uploads made with `fetch`, exactly as the reporter makes them
- an upload with a tampered content type, which is refused
- reads and range requests through presigned URLs
- multipart uploads
- batch deletes past S3's 1000-key limit
- object tags and lifecycle rules

The ingest API, the artifact route, retention and "force delete" also run end to end on `STORAGE_DRIVER=s3`. A
shared contract suite (`test/helpers/storage-contract.ts`) runs against the local driver and S3 alike, so the two
stay interchangeable. CI starts RustFS as a service container. To use a stub that is already running:

```bash
docker run -d -p 9000:9000 -e RUSTFS_ACCESS_KEY=pwr-test-access-key -e RUSTFS_SECRET_KEY=pwr-test-secret-key rustfs/rustfs:1.0.0
TEST_S3_ENDPOINT=http://localhost:9000 nub run test:integration
```

`TEST_S3_ACCESS_KEY_ID` and `TEST_S3_SECRET_ACCESS_KEY` set other credentials, for a stub started with them.
Locally, without Docker or `TEST_S3_ENDPOINT`, the S3 suites are skipped with a notice. On CI a missing stub fails
the run. Both projects run together with
`nub run --filter @miguelfranken/web test:all`.

</details>

### Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org), and every push to `main` releases
automatically: after CI, [`release.yml`](.github/workflows/release.yml) runs semantic-release, publishes the reporter
to GitHub Packages, and commits the version bump and [`CHANGELOG.md`](CHANGELOG.md) back with a tag and a GitHub
release. PRs are squash-merged with their title as the commit message, so the title decides the release (`fix:` and
`feat:` bump the patch version while on 0.x, a breaking change the minor version). Run the workflow manually for a
dry run.

## License

[MIT](LICENSE) © Miguel Franken
