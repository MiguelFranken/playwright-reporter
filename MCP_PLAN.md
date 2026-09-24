# MCP server: product plan

> Status: **phases 0–3 implemented** (see "Implementation status" in the technical plan); phase 4 open · Scope: `apps/web` (server), `packages/mcp` (local bridge), `packages/ui` (setup and
> hand-off UI) · Technical companion: [MCP_PLAN_TECHNICAL.md](MCP_PLAN_TECHNICAL.md)

This plan gives AI coding assistants (Claude Code, Cursor, VS Code Copilot, Windsurf, Codex, Claude Desktop, claude.ai,
ChatGPT) direct, permission-aware access to the test history this app already collects. We do it with a
[Model Context Protocol](https://modelcontextprotocol.io) server that lives inside the self-hosted instance.

The goal is short. A developer in their editor asks *"why is the checkout test red on my branch?"*. The agent answers
with evidence: which attempts failed and how, whether the test is flaky or broken, the last green commit, the
screenshot, and the command to re-run it. The developer never opens a browser tab or pastes a stack trace.

---

## 1. Why

**What we have today:**

- Every run, test, retry, error, step, log and artifact is stored with its git and CI context.
- We compute reliability, flaky rate, chronic failures, p95 durations and error signatures from that data.

**What's missing** is a way for an AI assistant to read any of it. So debugging a failure with an AI assistant still
goes like this:

1. Open the run in the browser.
2. Find the failing test.
3. Copy the error, and maybe the stack and a screenshot.
4. Paste it into the chat.
5. Answer the assistant's follow-ups ("does it fail on main too?", "since when?") by clicking around again.

The assistant also starts with no memory in every conversation. It cannot know that *"this test failed 4 of the
last 7 runs, only in Firefox, since commit `a1b2c3d`"*. We know exactly that. The MCP server hands it over.

`plans/PROJECT.md` already lists "Public REST API and MCP server" as post-MVP work, to start once the internal API
settles. The internal query layer (`lib/db/queries/*`) and the access layer (`lib/auth/access.ts`) are now stable
enough to build on.

## 2. Goals and non-goals

### Goals

1. **Evidence, not dumps.** Tools return compact, pre-computed answers: verdicts, diffs, rankings and regression
   windows. Raw JSON is the exception. The model should reason about conclusions we can compute exactly, not rebuild
   statistics from thousands of rows.
2. **One permission model.** An MCP caller sees exactly what the same user sees in the web UI, and never more. Team
   roles, 404-not-403 and superadmin rules all carry over unchanged.
3. **Self-hosted first.** The server runs inside the instance next to the database. No data leaves the deployment
   except what the user's AI client asks for.
4. **Lean by default.** A small, read-only default toolset that fits comfortably in a model's context. More tools are
   opt-in.
5. **Works in every mainstream client.** Remote (Streamable HTTP) is the primary transport. A tiny local stdio bridge
   covers clients that only speak stdio. OAuth covers web clients that can't set headers.
6. **Closes the loop.** Beyond "why did it fail", the server can answer "did my fix hold?" and "what do I run to
   check it?".

### Non-goals (for this plan)

- **Editing source code or opening PRs.** The assistant already does that in the editor. We provide evidence only.
- **Our own LLM features on the server.** We don't run models or charge for AI credits. The user's assistant does the
  reasoning, and our job is to give it deterministic facts. That keeps the server cheap, fast, private and
  reproducible.
- **Manual test-case management, releases, exploratory sessions.** The product doesn't have these domains, and we
  won't add them just to expose them over MCP.
- **Write access in the first release.** Writes come later as a separate, opt-in toolset behind a separate token scope
  (see phase 4).

## 3. Who uses it and how

| Persona | Typical ask | What they need back |
|---|---|---|
| **Developer fixing a red PR** | "Why is `checkout.spec.ts` failing on my branch?" | Failure evidence, flaky vs broken verdict, last green commit, screenshot, re-run command |
| **Developer after pushing a fix** | "Run #214 just finished. Did my fix hold?" | A strict verdict: fixed / still failing / different failure / only passes on retry |
| **Tech lead / QA owner** | "What should we fix first in this project?" | Ranked chronic failures and flaky tests, weighted by how often they break runs |
| **Release manager** | "Is `release/2.4` healthier than `main`?" | Branch vs branch comparison: pass rate, new failures, new flakes |
| **On-call / CI babysitter** | "Summarise last night's failed run on `main`" | Failures grouped by root cause, largest group first, with links |
| **Anyone** | "Which tests got slower this month?" | Duration regressions with p95 and trend |

### Example prompts we design for

These double as acceptance tests. Each must be answerable in **three tool calls or fewer**.

| Prompt | Expected tool path |
|---|---|
| *Show me the failed tests from the latest run on main* | `list_runs` → `list_run_results` |
| *Summarise run #128 by root cause* | `summarize_failures` |
| *Which tests are the flakiest over the last 30 days?* | `find_tests` |
| *Debug the failing "applies a coupon" test in run #128* | `get_failure_context` → (`get_artifact`) |
| *Is this test flaky or actually broken?* | `check_flakiness` |
| *When did this test start failing, and which commit did it?* | `get_failure_context` (regression window) |
| *I pushed a fix and run #131 finished. Did it hold?* | `verify_fix` |
| *What changed between yesterday's run and today's?* | `compare_runs` |
| *Is my branch worse than main?* | `compare_runs` (branch mode) |
| *Give me the command to re-run just the failures from #128* | `get_rerun_command` |
| *What should we fix first?* | `project_health` |
| *Which tests got slower this month?* | `find_tests` (sort by duration trend) |

## 4. Product principles for the tool surface

These are the rules every tool follows. The technical plan turns them into shared code.

1. **Answer-shaped tools over table-shaped tools.** `verify_fix` returns `fixed`, not a history table the model has
   to interpret. When we can compute the answer exactly, we compute it.
2. **Deterministic verdicts that rule things out.** Verdicts come from stored attempts, never from a model.
   Alongside each verdict we say which fixes the evidence **rules out**. A test that failed the same way on every
   retry rules out "add a wait". A test that passed on retry rules out "the assertion is wrong". We describe
   behaviour; we never claim to know the cause.
3. **One vocabulary everywhere.**
   - Parameters are named the same in every tool: `project`, `run`, `test`, `result`, `since`, `until`, `limit`,
     `cursor`.
   - Time windows are always ISO dates or relative durations (`24h`, `7d`, `30d`).
   - Pagination is always `limit` plus an opaque `cursor`.
   - Lists are always arrays, never comma-separated strings.
4. **Human identifiers accepted.** You can write a project as `acme/web` (the same slugs as the URL) and a run as
   `#128`, `128`, `latest` or `latest-failed` (optionally scoped to a branch). A test can be referenced by id, by title (with the file to
   disambiguate) or by pasting its web URL. The model never has to copy an opaque id from one call into the next
   unless it wants to.
5. **A default project.** A connection can be pinned to one project by URL parameter, header, token restriction or
   auto-detection from the git remote, so `project` is optional in the common case.
6. **Small by default, bigger on request.** Every response fits a budget of about 5k tokens. When we cut something,
   we say so and give the exact parameter that narrows or pages the result. Markdown is the default text format,
   because it's compact and readable for both model and human. A typed `structuredContent` payload comes with it for
   clients that use it.
7. **Every entity links back.** Runs, tests, results and branches carry their web URL, so the assistant can hand the
   human a link to the full UI.
8. **Errors tell you what to do next.** An error is a normal tool result with a code, a one-line reason and a
   suggested next call. For example: *"Run #999 not found in acme/web. The latest run is #214. Call `list_runs` to
   browse."*
9. **Honest annotations.** Every tool declares `readOnlyHint` and related hints, so clients can auto-approve reads
   and put anything that writes behind a confirmation.
10. **Test output is data, not instructions.** Titles, error messages, logs and annotations come from the code under
    test and may contain anything. We return them fenced and labelled, and the usage guide tells the model to treat
    them as untrusted.

## 5. Capabilities

### 5.1 Tools (first releases: all read-only)

Tools are grouped into **toolsets**. `core` and `debug` are on by default (16 tools in total). A connection can
narrow them, for example to `?toolsets=core`.

#### Toolset `core`: find things

| Tool | Answers | Notes |
|---|---|---|
| `whoami` | Who am I connected as, which teams and projects can I reach, what's my role, when does my token expire, what's the default project? | Call first. Doubles as a connection check. |
| `list_filters` | Which branches, environments, browser projects, tags and authors exist in this project? | Stops the model guessing filter values. |
| `list_runs` | Runs filtered by status, branch, environment, author, commit, tag, executor, CI vs local, and time window | Counts per run: passed, failed, flaky, skipped. Newest first. |
| `get_run` | One run's header: status, duration, git and CI, shards, counts, top failure groups, slowest specs | Accepts `#128`, `latest`, `latest-failed`, optionally scoped by `branch` |
| `list_run_results` | The tests in one run, filtered by outcome, file, title, error signature, error category, retried, has-artifacts or min duration | Each row carries the last 10 outcomes of that test |
| `get_result` | One test execution in full: every attempt, errors with code snippet and location, failed steps, logs (opt-in), attachments with short-lived links | Steps default to "failed only" |
| `find_tests` | Tests across runs: flakiest, most failing, chronic, slowest, getting slower, least reliable, by tag, browser project or environment | Backed by the existing test explorer |
| `get_test_history` | One test over time: reliability, flaky and failure rate, p95, duration trend, streak, per-environment and per-branch breakdown, sibling browser projects, distinct errors, recent executions | |
| `project_health` | Where the project stands and what to fix first: run pass rate, reliability, chronic failures, top flaky tests, duration outliers, trend | Optional branch scope |

#### Toolset `debug`: explain and verify

| Tool | Answers | Notes |
|---|---|---|
| `get_failure_context` | **Start here for any failing test.** In one call: the failure, its category, a per-attempt verdict, the regression window, where else it fails (browsers, environments, branches), sibling projects, artifacts, and which fixes the evidence rules out | The "one call" debugging entry point. `format` and `detail` control size. |
| `check_flakiness` | Is this test flaky, deterministic, or is there not enough data to say? | Looks at retries within a run **and** different outcomes on the same commit across runs |
| `summarize_failures` | A run's failures grouped by root cause (error signature), largest group first, with category, affected files and browsers, and whether each group is **new** or **already failing on the base branch** | The "triage a red run" entry point |
| `compare_runs` | What changed between two runs, or between a branch and its base: new failures, fixed tests, new flakes, still failing, duration regressions | Defaults: latest run on a branch vs latest on the base branch (`main` by default) |
| `verify_fix` | Given a test and the run it failed in, did later runs fix it? | Strict: passing only after retries is `unstable`, not `fixed` |
| `get_artifact` | The contents of one attachment: screenshots and diffs as images, text attachments inline, traces as a signed link plus a local `npx playwright show-trace` command | Expired artifacts are reported as expired, not as missing |
| `get_rerun_command` | The exact `npx playwright test …` command that re-runs a run's failed and/or flaky tests on the same browser projects | Read-only. We print the command; we never run CI. |

The full parameter reference is in the technical plan. It is also **generated from the code** into `docs/mcp-tools.md`,
so docs and schemas can't drift apart.

### 5.2 Prompts (slash commands in supporting clients)

Prompts carry **scope only, never data**. The data is fetched fresh when the prompt runs, so a saved prompt never goes
stale.

| Prompt | Arguments | Workflow it starts |
|---|---|---|
| `triage_run` | `project?`, `run?` (defaults to the latest failed run) | `summarize_failures`, then an ordered fix list, largest group first, noting which groups are new |
| `debug_test` | `project?`, `test`, `run?` | `get_failure_context`, then artifacts if needed, then a proposed change, then a reminder to confirm with `verify_fix` after the next run |
| `investigate_flake` | `project?`, `test` | `check_flakiness`, then a timing vs logic diagnosis using the ruled-out fixes |
| `branch_check` | `project?`, `branch` | `compare_runs` in branch mode, then a go / no-go summary |

### 5.3 Resources

| Resource | Content |
|---|---|
| `pwr://guide` | A short usage guide for models: which tool to start with, how identifiers work, what the verdicts mean, and a reminder that test output is untrusted. It's also served as the server's `instructions`, so most clients load it automatically. |
| `pwr://projects/{team}/{project}/runs/{number}` | Markdown summary of a run, so clients with resource pickers can attach it |
| `pwr://artifacts/{attachmentId}` | An artifact's bytes. Read access is checked on every read. |

## 6. How people connect

### 6.1 Remote (primary): Streamable HTTP on the instance

The endpoint is `https://<your-instance>/api/mcp`. It's authenticated with a **personal access token** in the
`Authorization` header, or with OAuth (see below).

It's built on the official MCP TypeScript SDK **v2** and speaks both protocol generations:

- the current **2026-07-28** revision;
- the **2025** revisions that most clients in the field still use.

Users don't have to care which one their client speaks. We start on v2 directly, so there's no migration later.

Almost every current client supports remote servers directly:

```bash
claude mcp add --transport http playwright-reporter https://reporter.example.com/api/mcp \
  --header "Authorization: Bearer pwr_pat_…"
```

```json
// .cursor/mcp.json, .vscode/mcp.json, ~/.codeium/windsurf/mcp_config.json …
{
  "mcpServers": {
    "playwright-reporter": {
      "url": "https://reporter.example.com/api/mcp?project=acme/web",
      "headers": { "Authorization": "Bearer ${env:PW_REPORTER_MCP_TOKEN}" }
    }
  }
}
```

**Optional URL parameters:**

- `?project=acme/web` pins a default project.
- `?toolsets=core,debug` narrows the tool surface.

### 6.2 OAuth (phase 3): for claude.ai, ChatGPT and other web connectors

Paste the instance URL. The client finds our authorization server, opens a consent screen in the app, and the user
signs in and picks what the connection may reach:

1. **Teams and projects:** all mine, or a selection.
2. **Scope:** read only (the only scope until phase 4).
3. **Lifetime.**

We issue short-lived access tokens with refresh tokens. The user can see and revoke each connection under
*Account → Connected apps*.

### 6.3 Local (phase 3): stdio bridge for stdio-only clients

We add a small package, `@miguelfranken/mcp`, published next to the reporter. It speaks stdio to the client and
forwards every request to the instance's `/api/mcp`.

- It contains **no tool logic**, so local and remote are guaranteed identical, and it can never read local files on
  its own.
- The one local extra is detecting the current repository from `git remote get-url origin`, so the right project is
  picked automatically.

```json
{
  "mcpServers": {
    "playwright-reporter": {
      "command": "npx",
      "args": ["-y", "@miguelfranken/mcp"],
      "env": { "PW_REPORTER_URL": "https://reporter.example.com", "PW_REPORTER_MCP_TOKEN": "pwr_pat_…" }
    }
  }
}
```

The environment variable names reuse the reporter's `PW_REPORTER_*` prefix. A repo that already sets
`PW_REPORTER_URL` for CI works as-is.

## 7. Access and permissions

- **New credential: personal access tokens (PATs).** They belong to a **user**, unlike the existing per-project
  ingest tokens, which authenticate a reporter.
  - Created under *Account → Access tokens*, with a name, an expiry (default 90 days, max 1 year) and optional
    restrictions: specific teams, or one specific project.
  - Shown once and stored as a hash, the same as ingest tokens today.
  - Visually distinct prefix: `pwr_pat_` vs `pwr_`.
- **The effective permission is checked on every call.** It's the intersection of:
  1. what the user can do **right now** (team role, superadmin), and
  2. what the token is restricted to.

  If a user is removed from a team, their tokens stop seeing it immediately. No re-issue is needed.
- **Mapping to the existing RBAC.** All `core` and `debug` tools need `run:read`, and artifact contents need
  `artifact:read`. Admins, members and viewers can all use every read tool. A future write toolset maps each tool to
  an explicit permission (for example `run:delete`) **and** needs a token with the `write` scope.
- **Superadmins.** A superadmin's token covers only the teams they are a member of, unless they explicitly tick
  "all teams (superadmin)" when creating it. A leaked everyday token then can't expose the whole instance.
- **Wrong token type.** Using an ingest token against `/api/mcp`, or a PAT against ingest, fails with a clear message
  that says which kind of token is needed.
- **Audit trail.** `pat.create`, `pat.revoke`, `oauth.grant` and `oauth.revoke` go into the audit log. Tool calls
  update `last_used_at` and are logged at the server level, not into the audit table, because that would be too
  noisy.
- **Rate limit.** A generous per-token limit (default 120 calls per minute). Exceeding it returns a normal tool error
  with a retry hint.
- **Kill switch.** `MCP_ENABLED=false` switches the endpoint off for the whole instance.

## 8. In-app experience

1. **Account → Access tokens**: create, list (name, prefix, restrictions, last used, expiry) and revoke PATs.
2. **Account → AI assistants**: ready-to-copy setup for each client, **pre-filled with this instance's URL** and the
   current project. It includes one-click install links where clients support them (Cursor, VS Code) and a test
   button that calls `whoami`.
3. **"Debug with AI" button** on failed or flaky results and on runs with failures. It opens a small menu:
   - **Copy prompt**: a scope-only prompt such as *"Use playwright-reporter to debug result `…` of run #128 in
     acme/web"*. It never contains data, so it never goes stale.
   - **Open in Cursor / VS Code**: a deep link carrying the same prompt.
   - **Set up the MCP server**: a link to the setup page if the user hasn't connected yet.
4. **Admin → MCP** (superadmin): the instance switch, tokens per user with revoke, and OAuth clients.

## 9. Rollout

Each phase ships on its own and is useful on its own. Phase numbers are order, not size.

### Phase 0: foundations

- `personal_access_tokens` table, token generation and hashing, and the *Account → Access tokens* UI.
- Refactor the access layer so it can resolve "user X may read project Y" **without a browser session**. Pages keep
  working exactly as before.
- **Done when:** a user can create and revoke a PAT, and an integration test proves that a PAT resolves to the same
  project access as that user's session.

### Phase 1: MCP endpoint and `core` toolset

- `/api/mcp` (Streamable HTTP, stateless), bearer auth, the tool registry, shared parameter parsing, markdown and
  structured output, the error model, the response budget and the rate limit.
- `whoami`, `list_filters`, `list_runs`, `get_run`, `list_run_results`, `get_result`, `find_tests`,
  `get_test_history`, `project_health`.
- The `pwr://guide` resource and server instructions.
- *Account → AI assistants* setup page, a README section, and generated `docs/mcp-tools.md`.
- **Done when:** the first five example prompts in §3 work end to end in Claude Code and Cursor against the demo
  project, and a viewer can't see a team they aren't in (integration-tested).

### Phase 2: `debug` toolset, prompts and hand-off

- `get_failure_context`, `check_flakiness`, `summarize_failures`, `compare_runs`, `verify_fix`, `get_artifact`,
  `get_rerun_command`.
- Prompts `triage_run`, `debug_test`, `investigate_flake`, `branch_check`. Run and artifact resources.
- The "Debug with AI" button.
- **Done when:** all example prompts in §3 run in three calls or fewer, and every verdict has unit tests covering
  each branch of its decision table.

### Phase 3: reach

- OAuth 2.1 (PKCE, client registration, consent screen, refresh tokens, *Connected apps*) so claude.ai and ChatGPT
  can connect.
- The `@miguelfranken/mcp` stdio bridge with git-remote project detection, released through the existing
  semantic-release pipeline.
- **Done when:** claude.ai and ChatGPT connect with no token copy-paste, and Claude Desktop works through the bridge.

### Phase 4 (optional, separate decision): write toolset

This needs a `write` token scope, `destructiveHint` annotations, a **preview/confirm** pair for each action and
idempotency keys. Confirmation is an explicit tool argument, not the protocol's elicitation feature, because
elicitation can't work for 2025-era clients on a stateless server. Clients holding a read-only grant are asked to
re-authorize for `write` (step-up authorization). Candidates, each only if the product feature exists first:

- **Quarantine / mute a test** (needs a product-level quarantine concept first).
- **Create a GitHub or GitLab issue from a failure group**, with a preview and a link back to the run.
- **Dispatch a CI re-run** of selected tests, with an explicit confirm step and a choice between the same commit and
  the branch tip.

## 10. How we'll know it works

- **Adoption:** the number of users with an active PAT or OAuth grant, and weekly active tokens.
- **Depth:** tool calls per session, and the share of sessions that reach a debug tool (not just `whoami`).
- **Efficiency:** median tool calls to answer the §3 prompts (target ≤ 3), and the 95th percentile response size
  (target ≤ 5k tokens).
- **Reliability:** p95 tool latency under 800 ms, and an error rate (excluding user errors) under 1%.
- **Qualitative:** an internal dogfooding week where every red PR is first triaged through the MCP server.

We measure all of this from server logs. We don't add product analytics or telemetry to the client bridge.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Data exposure through a leaked token** | Hashed storage, mandatory expiry, team or project restriction, instant revoke, `last_used_at` shown in the UI, per-token rate limit, superadmin tokens scoped to their teams by default |
| **Prompt injection via test output** (titles, errors, stdout) | Fenced and labelled untrusted blocks, logs opt-in, a warning in the guide, no write tools until phase 4, and no local file access in the bridge |
| **Large responses flooding the model's context** | A per-response budget with announced truncation, `detail` levels, "failed steps only" by default, and logs opt-in |
| **Tool-surface bloat** | 16 tools in two toolsets, short descriptions, and a toolset filter per connection |
| **Docs drifting from behaviour** | One registry is the source of truth. The docs are generated from it, and a snapshot test fails when a schema changes without a docs update. |
| **Slow queries on large projects** | Tools reuse the existing indexed queries. New SQL gets `EXPLAIN` review on seeded data, and every list is bounded. |
| **SDK v2 is new** (stable since July 2026) and the protocol just gained a new revision | The SDK is pinned to a minor version (`~2.1`) and isolated behind one module (`lib/mcp/server.ts`). Known open SDK issues (schema conversion cost, idle streams on serverless, missing Host checks) are designed around explicitly (technical plan §2.2). Every upgrade PR runs tests against both protocol generations. |
| **OAuth complexity** | Deferred to phase 3. Phases 1 and 2 are fully useful with PATs, and we use a maintained Better Auth plugin rather than building our own where possible. |

## 12. Open questions

1. **Package registry for the bridge.** The reporter is published to GitHub Packages, which needs an `.npmrc` token
   even for `npx`. Should `@miguelfranken/mcp` go to the public npm registry instead, so the one-line setup works?
2. **Default toolsets.** Should `debug` be on by default (current proposal), or opt-in to keep the default surface
   down to nine tools?
3. **Logs in `get_result`.** Keep stdout and stderr opt-in (current proposal), or include a short tail by default?
4. **Quarantine.** Do we want a product-level quarantine or mute feature? It's the most valuable write tool and the
   prerequisite for phase 4.
5. **Error categories.** Today they're derived in the UI layer from the message. Is that enough for MCP filtering
   (the current proposal computes them per request), or do we want to persist them at ingest?
