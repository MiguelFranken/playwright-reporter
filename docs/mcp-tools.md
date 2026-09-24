# MCP tool reference

<!-- Generated from apps/web/lib/mcp by `nub run mcp:docs` (in apps/web). Do not edit by hand. -->

Every tool is read-only (`readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`). Every project-scoped tool
also accepts `project`, `format` (`markdown` | `json`) and `maxChars`. See the README section "AI assistants (MCP)" for setup.

| Tool | Toolset | Summary |
|---|---|---|
| [`whoami`](#whoami) | core | Call first when you do not know the project. |
| [`list_filters`](#list_filters) | core | Use before filtering when unsure of exact values. |
| [`list_runs`](#list_runs) | core | Find test runs. |
| [`get_run`](#get_run) | core | One run in detail: status, git and CI context, counts, the top failure groups by error signature and, on request, slowest specs, shards and system metadata. |
| [`list_run_results`](#list_run_results) | core | The tests of one run, failures first. |
| [`get_result`](#get_result) | core | One test execution in full: every attempt with its errors (message, location, code snippet, stack), the failing step, optional logs, attachments with short-lived links, and recent history. |
| [`find_tests`](#find_tests) | core | Rank or search tests across runs: flakiest, most failing, chronic, slowest (p95), getting slower, least reliable — or find a test by title. |
| [`get_test_history`](#get_test_history) | core | One test over time: reliability, failure and flaky rate, p95 duration and trend, streak, breakdown by environment and branch, the same test in other browser projects, its distinct errors, and recent executions. |
| [`project_health`](#project_health) | core | Where a project stands and what to fix first: run pass rate, reliability, a ranked fix-first list (failures weigh fully, flakes half), flakiest and slowest tests, tests getting slower, and the most widespread errors. |

## whoami

**Who am I** · toolset `core`

Call first when you do not know the project. Shows who this connection acts as, the teams and projects it can read (as "team/project" refs), roles, token expiry and the default project.

No parameters.

Structured output fields: `user`, `credential`, `defaultProject`, `teams`, `toolsets`, `truncated`.

## list_filters

**List filter values** · toolset `core`

Use before filtering when unsure of exact values. Returns the branches, environments, browser projects, test tags, run tags and commit authors seen in a project recently, plus its base branch.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `since` | string |  | Start of the window: a duration back from now ("24h", "7d", "4w") or an ISO date. |

Structured output fields: `project`, `window`, `defaultBranch`, `branches`, `environments`, `browsers`, `testTags`, `runTags`, `authors`, `truncated`.

## list_runs

**List runs** · toolset `core`

Find test runs. Filter by status, branch, environment, author, commit, tag, CI vs local and time window; newest first. Each run carries its pass/fail/flaky counts and a link.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `status` | `"running"` \| `"passed"` \| `"failed"` \| `"timedout"` \| `"interrupted"` \| `"incomplete"` \| `"running"` \| `"passed"` \| `"failed"` \| `"timedout"` \| `"interrupted"` \| `"incomplete"`[] |  | Run status(es). "incomplete" includes abandoned runs. |
| `branch` | string |  | Git branch name, e.g. "main". |
| `environment` | string |  | Environment label the reporter sent, e.g. "staging". |
| `author` | string |  | Part of the commit author name. |
| `commit` | string |  | Commit SHA prefix (at least 4 characters). |
| `tag` | string |  | A run tag. |
| `executor` | `"ci"` \| `"local"` |  | Runs from CI or from a laptop. |
| `search` | string |  | Text in the commit message, or a run number. |
| `since` | string |  | Start of the window: a duration back from now ("24h", "7d", "4w") or an ISO date. |
| `until` | string |  | End of the window: a duration back from now or an ISO date. Default: now. |
| `sort` | `"newest"` \| `"oldest"` \| `"slowest"` \| `"fastest"` |  | Order (default newest). |
| `limit` | integer (1–100) |  | Rows per page (1–100, default 20). |
| `cursor` | string |  | Opaque cursor from a previous response, for the next page. Keep the other filters unchanged. |

Structured output fields: `project`, `window`, `total`, `runs`, `nextCursor`, `truncated`.

## get_run

**Get run** · toolset `core`

One run in detail: status, git and CI context, counts, the top failure groups by error signature and, on request, slowest specs, shards and system metadata. Run can be "#128", "latest" or "latest-failed".

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `run` | integer (–9007199254740991) \| string |  | Run number (128 or "#128"), run id, run URL, "latest" or "latest-failed". Scope "latest" with branch/environment. |
| `branch` | string |  | Git branch name, e.g. "main". |
| `environment` | string |  | Environment label the reporter sent, e.g. "staging". |
| `include` | `"failures"` \| `"specs"` \| `"shards"` \| `"metadata"`[] |  | Extra sections: failures (default), specs, shards, metadata. |

Structured output fields: `project`, `run`, `failureGroups`, `specs`, `shards`, `metadata`, `neighbours`, `truncated`.

## list_run_results

**List run results** · toolset `core`

The tests of one run, failures first. Filter by outcome (default: failed, timed out, interrupted, flaky), file, title, error signature or category, browser, retries, artifacts or duration. Each row has the test’s last 10 outcomes.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `run` | integer (–9007199254740991) \| string |  | Run number (128 or "#128"), run id, run URL, "latest" or "latest-failed". Scope "latest" with branch/environment. |
| `branch` | string |  | Git branch name, e.g. "main". |
| `environment` | string |  | Environment label the reporter sent, e.g. "staging". |
| `outcome` | `"passed"` \| `"failed"` \| `"timedout"` \| `"flaky"` \| `"skipped"` \| `"interrupted"` \| `"running"` \| `"passed"` \| `"failed"` \| `"timedout"` \| `"flaky"` \| `"skipped"` \| `"interrupted"` \| `"running"`[] |  | Outcome(s) to list. Default: the problems — failed, timedout, interrupted, flaky. Pass every outcome for all tests. |
| `file` | string |  | Part of the spec file path, e.g. "checkout.spec". |
| `search` | string |  | Part of the test title. |
| `signature` | string |  | Error signature (or its prefix) from get_run / summarize_failures. |
| `category` | `"assertion"` \| `"timeout"` \| `"locator"` \| `"network"` \| `"crash"` \| `"snapshot"` \| `"other"` \| `"assertion"` \| `"timeout"` \| `"locator"` \| `"network"` \| `"crash"` \| `"snapshot"` \| `"other"`[] |  | Failure category: assertion, timeout, locator, network, crash, snapshot, other. |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `retried` | boolean |  | Only tests that needed a retry (true) or passed/failed on the first attempt (false). |
| `hasArtifacts` | boolean |  | Only tests with (true) or without (false) screenshots, traces or videos. |
| `minDurationMs` | integer (0–9007199254740991) |  | Only tests that took at least this long. |
| `sort` | `"outcome"` \| `"file"` \| `"duration"` |  | Order: outcome (failures first, default), file, or duration (slowest first). |
| `limit` | integer (1–100) |  | Rows per page (1–100, default 20). |
| `cursor` | string |  | Opaque cursor from a previous response, for the next page. Keep the other filters unchanged. |

Structured output fields: `project`, `run`, `countsByOutcome`, `total`, `results`, `nextCursor`, `truncated`.

## get_result

**Get result** · toolset `core`

One test execution in full: every attempt with its errors (message, location, code snippet, stack), the failing step, optional logs, attachments with short-lived links, and recent history. Pass "result", or "test" plus "run".

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `result` | string |  | Result id or result URL (…/runs/128/tests/<id>). |
| `run` | integer (–9007199254740991) \| string |  | Run number (128 or "#128"), run id, run URL, "latest" or "latest-failed". Scope "latest" with branch/environment. |
| `test` | string |  | Test id, test or result URL, or part of the test title. Add file/browser to pick one when several tests match. |
| `file` | string |  | Part of the spec file path, e.g. "checkout.spec". |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `branch` | string |  | Git branch name, e.g. "main". |
| `environment` | string |  | Environment label the reporter sent, e.g. "staging". |
| `steps` | `"failed"` \| `"all"` \| `"none"` |  | Steps per attempt: "failed" (default: the failing step and its parents), "all", or "none". |
| `attempts` | `"all"` \| `"last"` |  | Every attempt (default) or only the last one. |
| `includeLogs` | boolean |  | Include the tail of stdout/stderr (default false). |
| `logLines` | integer (1–500) |  | Log lines per stream when includeLogs is set (default 50). |

Structured output fields: `project`, `test`, `run`, `resultId`, `outcome`, `expectedStatus`, `durationMs`, `attempts`, `history`, `navigation`, `url`, `truncated`.

## find_tests

**Find tests** · toolset `core`

Rank or search tests across runs: flakiest, most failing, chronic, slowest (p95), getting slower, least reliable — or find a test by title. Filter by tag, browser, environment, branch and window.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `search` | string |  | Title or file; a regular expression when valid, otherwise a substring. |
| `status` | `"flaky"` \| `"chronic"` \| `"failing"` \| `"stable"` \| `"passed"` \| `"skipped"` |  | flaky: flaked at least once · chronic: failing persistently · failing: last result failed · stable: no failures or flakes. |
| `tags` | string[] |  | Tests carrying any of these tags. |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `environment` | string |  | Environment label the reporter sent, e.g. "staging". |
| `branch` | string |  | Git branch name, e.g. "main". |
| `since` | string |  | Start of the window: a duration back from now ("24h", "7d", "4w") or an ISO date. |
| `minRuns` | integer (1–9007199254740991) |  | Ignore tests with fewer executions in the window (default 3). |
| `sort` | `"flakyRate"` \| `"failureRate"` \| `"reliability"` \| `"avgDuration"` \| `"p95Duration"` \| `"durationTrend"` \| `"runs"` \| `"lastRun"` |  | Ranking (default flakyRate). durationTrend = getting slower; reliability sorts least reliable first. |
| `dir` | `"asc"` \| `"desc"` |  | Override the sort direction. |
| `limit` | integer (1–100) |  | Rows per page (1–100, default 20). |
| `cursor` | string |  | Opaque cursor from a previous response, for the next page. Keep the other filters unchanged. |

Structured output fields: `project`, `window`, `total`, `tests`, `nextCursor`, `truncated`.

## get_test_history

**Get test history** · toolset `core`

One test over time: reliability, failure and flaky rate, p95 duration and trend, streak, breakdown by environment and branch, the same test in other browser projects, its distinct errors, and recent executions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `test` | string | yes | Test id, test or result URL, or part of the test title. Add file/browser to pick one when several tests match. |
| `file` | string |  | Part of the spec file path, e.g. "checkout.spec". |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `branch` | string |  | Only executions on this branch for the recent list (stats cover every branch). |
| `since` | string |  | Start of the window: a duration back from now ("24h", "7d", "4w") or an ISO date. |
| `limit` | integer (1–100) |  | Recent executions to list (default 20). |

Structured output fields: `project`, `window`, `test`, `stats`, `byEnvironment`, `byBranch`, `siblings`, `errors`, `recent`, `truncated`.

## project_health

**Project health** · toolset `core`

Where a project stands and what to fix first: run pass rate, reliability, a ranked fix-first list (failures weigh fully, flakes half), flakiest and slowest tests, tests getting slower, and the most widespread errors. Optionally for one branch.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `branch` | string |  | Git branch name, e.g. "main". |
| `since` | string |  | Start of the window: a duration back from now ("24h", "7d", "4w") or an ISO date. |

Structured output fields: `project`, `window`, `branch`, `stats`, `trend`, `fixFirst`, `flaky`, `slowest`, `gettingSlower`, `topErrors`, `truncated`.

## Prompts

| Prompt | Arguments | Purpose |
|---|---|---|

## Resources

| URI | Content |
|---|---|
| `pwr://guide` | How to use the tools: identifiers, verdicts, paging, safety. |
| `pwr://projects/{team}/{project}/runs/{number}` | A run summary in markdown. |
| `pwr://artifacts/{attachmentId}` | An artifact’s bytes (access-checked on every read). |
