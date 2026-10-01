# MCP tool reference

<!-- Generated from apps/web/lib/mcp by `nub run mcp:docs` (in apps/web). Do not edit by hand. -->

Tools read (`readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`) except the `write` toolset, which edits
test cases and is offered only to tokens with the `write` scope; those are marked **writes**. Every project-scoped tool
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
| [`get_failure_context`](#get_failure_context) | debug | Start here for any failing or flaky test. |
| [`check_flakiness`](#check_flakiness) | debug | Is this test flaky, broken, or is there not enough data to say? Judges across runs: retries that passed, the same commit both passing and failing, and how often it flips. |
| [`summarize_failures`](#summarize_failures) | debug | Triage a red run: its failures grouped by root cause (error signature), largest group first, each with category, affected files and browsers, and whether it is new or already failing on the base branch. |
| [`compare_runs`](#compare_runs) | debug | What changed between two runs, or between a branch and its base branch: new failures, fixed tests, new flakes, still failing (same or different error), added and removed tests, and tests that got much slower. |
| [`verify_fix`](#verify_fix) | debug | After a fix landed: did later runs fix the test? Give the test and the run it failed in. |
| [`get_artifact`](#get_artifact) | debug | The contents of one test attachment: screenshots and visual diffs as images you can look at, text attachments inline, traces and videos as short-lived links (with a trace-viewer link and a local show-trace command). |
| [`get_rerun_command`](#get_rerun_command) | debug | The exact "npx playwright test …" command that re-runs a run’s failed and/or flaky tests on the same browser projects, one command per project, with a --list preview and the number of tests it should list. |
| [`list_test_suites`](#list_test_suites) | core | The project's test case suites as a tree, with how many cases each holds. |
| [`list_test_cases`](#list_test_cases) | core | Search and filter the manual and automated test cases of a project: by suite, status, priority, automation, tag, or what their linked Playwright tests say (failing, flaky, stale). |
| [`get_test_case`](#get_test_case) | core | One test case in full: description, conditions, steps, classification, custom fields, and the Playwright tests linked to it with their latest result and last 30 days. |
| [`list_uncovered_tests`](#list_uncovered_tests) | core | The Playwright tests no test case links to yet, one row per test with the ids of every browser it runs in, its file and describe blocks. |
| [`create_test_case`](#create_test_case) | write | Create a manual or automated test case with steps, in a suite (its path is created if missing). |
| [`update_test_case`](#update_test_case) | write | Change fields of a test case: title, steps, status, priority, suite, tags and the rest. |
| [`bulk_update_test_cases`](#bulk_update_test_cases) | write | Apply one change to many test cases at once, as ticking cases in the list does: set the priority, status, severity, type, behavior, automation or suite of each, mute them, or add and remove tags. |
| [`create_test_suite`](#create_test_suite) | write | Create a suite, optionally under a parent suite, to group test cases the way the product is built. |
| [`delete_test_suite`](#delete_test_suite) | write | Delete suites that hold no test cases, e.g. |
| [`link_test_case`](#link_test_case) | write | Link Playwright tests (by test id from find_tests) to a test case, or unlink them. |
| [`adopt_tests`](#adopt_tests) | write | Turn Playwright tests into test cases already linked to them: steps from their test.step() calls, one case per test across browsers. |
| [`list_feedback_requests`](#list_feedback_requests) | core | Start here to fix a product from visual feedback: every open request for a change on its screenshots — comment threads and "changes requested" without a comment — one record each, with the producing test (id, full title, file, browser), the checkpoint key, the image now and the one the request was made on, the whole conversation, and whether it waits for a fix or changed since (verify). |
| [`list_review_checkpoints`](#list_review_checkpoints) | core | A run's review checkpoints — the named screenshots its tests capture at their milestones, per variant (desktop, mobile) — in journey order, with each image's review status (changed against its approved baseline, new, approved or changes requested) its open comment threads, and its measured pixel change: how much of the image changed, in how many regions, whether the page changed size or its content moved. |
| [`get_review_checkpoint`](#get_review_checkpoint) | core | One review checkpoint image to look at, beside the image it is compared with — the one a request was made on (against "origin"), the approved baseline, or the run before — with the measured change and close-ups of the largest changed regions. |
| [`review_checkpoint`](#review_checkpoint) | write | Approve review checkpoint images, or ask for changes — with a comment, and on one image with pins that mark each change where it is. |
| [`list_review_threads`](#list_review_threads) | core | The comment threads people (or assistants) pinned on a run’s review images — change requests at a spot or an area of a screenshot — per image, by the number on the pin, with where each points (pixels, percent, CSS pixels) and the conversation. |
| [`comment_on_review`](#comment_on_review) | write | Pin a comment thread on a review image — at a spot or an area (in percent of the image), or about the whole image — or reply to a thread by its number. |
| [`resolve_review_thread`](#resolve_review_thread) | write | Mark a comment thread on a review image resolved — or open again — by the image and the number on its pin, with an optional closing note. |
| [`list_visual_diffs`](#list_visual_diffs) | core | Which review screens look different between two runs (or two branches / pull requests in the library), test by test — even when every test passed. |
| [`get_visual_diff`](#get_visual_diff) | core | One visual comparison in detail: the exact base and head captures and their runs, the test and checkpoint that produce the screen (file, title path, checkpoint key, step, URL), how the two were captured, and the measurement — raw changed pixels, what the checkpoint’s rules left out, what remains — with every changed region as D1, D2… (stable ids, rectangles in image pixels, which rules touch it). |
| [`get_visual_diff_image`](#get_visual_diff_image) | debug | The pictures of one visual comparison, in the mode that reads best: the head with the regions boxed and numbered (annotated), base and head of one region side by side at full resolution so a changed name or price can be read (pair, with regionIds), the changed pixels painted red (highlight), the threshold mask, the colour difference, the two faded over each other (onion), or a plain crop. |
| [`list_library`](#list_library) | core | The visual documentation of the product: the branches and pull requests kept in the library (and the default branch), which run of each is shown — the newest, or a pinned one — and how many of the newest run’s images still wait for review. |
| [`get_library_flows`](#get_library_flows) | core | The screens of a branch or pull request as the library shows them — every checkpoint as the newest run on it captured it, so partial runs never hide what they skipped: each flow (test) with its test cases and their priority, its checkpoints in journey order, and each variant’s capture id and review state (waiting for changes, ready to verify, needs review, updated, approved). |
| [`set_library_reference`](#set_library_reference) | write | Keep a branch or pull request in the library (a long-lived pull request can stay browsable while it is open), pin the run that documents it, make it the default, name it — or take it out. |

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

Find test runs. Filter by status, branch, pull request, environment, author, commit, tag, CI vs local and time window; newest first. Each run carries its pass/fail/flaky counts and a link.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `status` | `"running"` \| `"passed"` \| `"failed"` \| `"timedout"` \| `"interrupted"` \| `"incomplete"` \| `"running"` \| `"passed"` \| `"failed"` \| `"timedout"` \| `"interrupted"` \| `"incomplete"`[] |  | Run status(es). "incomplete" includes abandoned runs. |
| `branch` | string |  | Git branch name, e.g. "main". |
| `pullRequest` | integer (1–9007199254740991) \| string |  | Pull or merge request number, e.g. 42, "#42" or GitLab's "!1524". |
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

Structured output fields: `project`, `run`, `failureGroups`, `specs`, `shards`, `metadata`, `neighbours`, `provenance`, `artifacts`, `truncated`.

## list_run_results

**List run results** · toolset `core`

The tests of one run, failures first. Filter by outcome (default: failed, timed out, interrupted, flaky), file, title, error signature or category, browser, tag, retries, attachment kind or duration. Each row has the test’s last 10 outcomes.

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
| `artifact` | `"screenshot"` \| `"no-screenshot"` \| `"video"` \| `"no-video"` \| `"trace"` \| `"no-trace"` \| `"screenshot"` \| `"no-screenshot"` \| `"video"` \| `"no-video"` \| `"trace"` \| `"no-trace"`[] |  | Attachment kinds that must hold, all of them: "screenshot", "video", "trace" keep tests with one; "no-screenshot", "no-video", "no-trace" tests without. |
| `tag` | string \| string[] |  | Only tests carrying any of these tags, e.g. "@smoke" (see list_filters). |
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

## get_failure_context

**Get failure context** · toolset `debug`

Start here for any failing or flaky test. One call returns the failure, a per-attempt verdict, the regression window (last pass → first fail, with a compare link), where else it fails, artifacts, and which fixes the evidence rules out.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `result` | string |  | Result id or result URL (…/runs/128/tests/<id>). |
| `test` | string |  | Test id, test or result URL, or part of the test title. Add file/browser to pick one when several tests match. |
| `run` | integer (–9007199254740991) \| string |  | Run the failure happened in. Default: the latest run in 30 days where the test failed or flaked. |
| `file` | string |  | Part of the spec file path, e.g. "checkout.spec". |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `detail` | `"summary"` \| `"standard"` \| `"full"` |  | How much to return (default standard). summary: failure, verdict, regression window, ruled-out list. |
| `includeGuidance` | boolean |  | Include the short "how to read this" block (default true; turn off on repeat calls). |

Structured output fields: `project`, `failure`, `attempts`, `regression`, `spread`, `artifacts`, `ruledOut`, `pointsTo`, `next`, `truncated`.

## check_flakiness

**Check flakiness** · toolset `debug`

Is this test flaky, broken, or is there not enough data to say? Judges across runs: retries that passed, the same commit both passing and failing, and how often it flips. Returns a verdict with confidence and the evidence behind it.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `test` | string | yes | Test id, test or result URL, or part of the test title. Add file/browser to pick one when several tests match. |
| `file` | string |  | Part of the spec file path, e.g. "checkout.spec". |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `branch` | string |  | Git branch name, e.g. "main". |
| `since` | string |  | Start of the window: a duration back from now ("24h", "7d", "4w") or an ISO date. |

Structured output fields: `project`, `window`, `test`, `verdict`, `confidence`, `reason`, `evidence`, `ruledOut`, `pointsTo`, `truncated`.

## summarize_failures

**Summarize failures** · toolset `debug`

Triage a red run: its failures grouped by root cause (error signature), largest group first, each with category, affected files and browsers, and whether it is new or already failing on the base branch.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `run` | integer (–9007199254740991) \| string |  | Run to triage (default "latest-failed"). |
| `branch` | string |  | Git branch name, e.g. "main". |
| `environment` | string |  | Environment label the reporter sent, e.g. "staging". |
| `includeFlaky` | boolean |  | Include flaky tests in the groups (default true). |
| `limit` | integer (1–50) |  | Groups to return (default 10). |

Structured output fields: `project`, `run`, `baseBranch`, `totals`, `groups`, `ungrouped`, `truncated`.

## compare_runs

**Compare runs** · toolset `debug`

What changed between two runs, or between a branch and its base branch: new failures, fixed tests, new flakes, still failing (same or different error), added and removed tests, and tests that got much slower.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `base` | integer (–9007199254740991) \| string |  | The earlier run (default: latest finished run on the base branch before head). |
| `head` | integer (–9007199254740991) \| string |  | The later run (default: latest finished run on "branch", or on the base run’s branch). |
| `branch` | string |  | Branch mode: compare the latest run of this branch against the base branch. |
| `baseBranch` | string |  | Branch to compare against (default: the project’s base branch). |
| `environment` | string |  | Environment label the reporter sent, e.g. "staging". |
| `limit` | integer (1–100) |  | Rows per bucket (default 20). |

Structured output fields: `project`, `mode`, `base`, `head`, `summary`, `newFailures`, `fixed`, `newFlaky`, `stillFailing`, `added`, `removed`, `slower`, `truncated`.

## verify_fix

**Verify fix** · toolset `debug`

After a fix landed: did later runs fix the test? Give the test and the run it failed in. Strict — passing only after retries is "unstable", and a new error is "different_failure", never "fixed".

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `test` | string | yes | Test id, test or result URL, or part of the test title. Add file/browser to pick one when several tests match. |
| `file` | string |  | Part of the spec file path, e.g. "checkout.spec". |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `baselineRun` | integer (–9007199254740991) \| string | yes | The run the failure happened in. |
| `branch` | string |  | Branch to check (default: the baseline run’s branch; "any" for every branch). |
| `requirePasses` | integer (1–20) |  | First-try passes in a row needed to call it fixed (default 1). |

Structured output fields: `project`, `test`, `status`, `confidence`, `explanation`, `baseline`, `branch`, `since`, `next`, `truncated`.

## get_artifact

**Get artifact** · toolset `debug`

The contents of one test attachment: screenshots and visual diffs as images you can look at, text attachments inline, traces and videos as short-lived links (with a trace-viewer link and a local show-trace command).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `attachment` | string |  | Attachment id (from get_result or get_failure_context). |
| `result` | string |  | Instead of an id: a result, whose failing attempt’s diff, actual or screenshot is picked. |
| `name` | string |  | With "result": the attachment name to pick (e.g. "trace", "screenshot"). |
| `kind` | `"screenshot"` \| `"video"` \| `"trace"` \| `"image"` \| `"text"` \| `"other"` |  | With "result": the kind to pick. |

Structured output fields: `project`, `attachment`, `resultUrl`, `delivered`, `url`, `traceViewerUrl`, `showTraceCommand`, `text`, `note`, `truncated`.

## get_rerun_command

**Get re-run command** · toolset `debug`

The exact "npx playwright test …" command that re-runs a run’s failed and/or flaky tests on the same browser projects, one command per project, with a --list preview and the number of tests it should list. Read-only: it prints the command and never starts a run.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `run` | integer (–9007199254740991) \| string |  | Run whose tests to re-run (default "latest-failed"). |
| `scope` | `"failed"` \| `"flaky"` \| `"failed-and-flaky"` |  | Which tests (default failed, which includes timed out). |
| `tests` | string[] |  | Exactly these test or result ids of the run; overrides scope. |
| `browser` | string |  | Playwright project name, e.g. "chromium" (see list_filters). |
| `style` | `"locations"` \| `"titles"` \| `"grep"` |  | Select tests by file:line from the reported run (default), or by "titles": anchored file filters plus a --grep anchored on each test’s file and full title, which survives moved lines. "grep" is the same title selection. Titles are chosen automatically when a line is unknown. |
| `repeat` | integer (2–100) |  | Add --repeat-each=N --retries=0, e.g. to reproduce a flake. |
| `launcher` | string |  | The command prefix your repository runs Playwright with, used instead of "npx playwright test", e.g. "pnpm test:e2e --". Printed as given. |

Structured output fields: `project`, `run`, `selected`, `commands`, `tests`, `notes`, `truncated`.

## list_test_suites

**List test suites** · toolset `core`

The project's test case suites as a tree, with how many cases each holds. Use a suite's path or id wherever a tool takes a suite.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |

Structured output fields: `project`, `total`, `unassigned`, `suites`, `truncated`.

## list_test_cases

**List test cases** · toolset `core`

Search and filter the manual and automated test cases of a project: by suite, status, priority, automation, tag, or what their linked Playwright tests say (failing, flaky, stale). Each row has its key (TC-12) for get_test_case.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `search` | string |  | Matches the key (TC-12), title, description, conditions, steps and tags. |
| `suite` | string |  | Only this suite and the suites below it; "unassigned" for cases without one. |
| `status` | `"active"` \| `"draft"` \| `"deprecated"` |  |  |
| `priority` | `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"none"` |  |  |
| `automation` | `"manual"` \| `"planned"` \| `"automated"` |  |  |
| `verdict` | `"passing"` \| `"failing"` \| `"flaky"` \| `"stale"` \| `"not_run"` \| `"none"` |  | What the linked Playwright tests say: passing, failing, flaky, stale, not_run, or none (no linked tests). |
| `tag` | string |  |  |
| `limit` | integer (1–100) |  | Rows per page (1–100, default 20). |
| `cursor` | string |  | Opaque cursor from a previous response, for the next page. Keep the other filters unchanged. |

Structured output fields: `project`, `total`, `cases`, `nextCursor`, `truncated`.

## get_test_case

**Get a test case** · toolset `core`

One test case in full: description, conditions, steps, classification, custom fields, and the Playwright tests linked to it with their latest result and last 30 days. Takes a key like TC-12.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `case` | string | yes | Test case key ("TC-12" or "12") or its id. |

Structured output fields: `key`, `title`, `suite`, `status`, `priority`, `severity`, `type`, `behavior`, `automation`, `muted`, `tags`, `description`, `preconditions`, `postconditions`, `stepsFormat`, `steps`, `customFields`, `verdict`, `version`, `linkedTests`, `url`, `truncated`.

## list_uncovered_tests

**List Playwright tests without a test case** · toolset `core`

The Playwright tests no test case links to yet, one row per test with the ids of every browser it runs in, its file and describe blocks. The starting point for organizing tests into cases: link a row to an existing case with link_test_case, or turn it into a new case with adopt_tests.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `search` | string |  | Title, file or describe block. |
| `limit` | integer (1–100) |  | Rows per page (1–100, default 20). |
| `cursor` | string |  | Opaque cursor from a previous response, for the next page. Keep the other filters unchanged. |

Structured output fields: `project`, `total`, `tests`, `nextCursor`, `truncated`.

## create_test_case

**Create a test case** · toolset `write` · **writes**

Create a manual or automated test case with steps, in a suite (its path is created if missing). Answers the new key (TC-12); tag a Playwright test with @TC-12 to link it on its next run.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `title` | string | yes | What the case verifies, e.g. "Log in with valid credentials". |
| `suite` | string |  | Suite id or path ("Checkout / Coupons"); missing levels are created. Omit for unassigned. |
| `description` | string |  | What the case checks, and why. |
| `preconditions` | string |  |  |
| `postconditions` | string |  |  |
| `stepsFormat` | `"classic"` \| `"gherkin"` |  | classic (action / test data / expected result) or gherkin. |
| `steps` | object[] |  | Replaces every step. |
| `status` | `"active"` \| `"draft"` \| `"deprecated"` |  |  |
| `priority` | `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"none"` |  |  |
| `severity` | `"blocker"` \| `"critical"` \| `"major"` \| `"normal"` \| `"minor"` \| `"trivial"` \| `"none"` |  |  |
| `type` | `"functional"` \| `"smoke"` \| `"regression"` \| `"integration"` \| `"e2e"` \| `"api"` \| `"unit"` \| `"performance"` \| `"security"` \| `"accessibility"` \| `"usability"` \| `"compatibility"` \| `"acceptance"` \| `"exploratory"` \| `"other"` |  |  |
| `behavior` | `"positive"` \| `"negative"` \| `"destructive"` \| `"none"` |  |  |
| `automation` | `"manual"` \| `"planned"` \| `"automated"` |  | manual, planned (to be automated) or automated. Linking a test sets automated by itself; prefer link_test_case. |
| `muted` | boolean |  |  |
| `tags` | string[] |  | Replaces every tag. |
| `customFields` | object |  | The project's custom fields, by key. |

Structured output fields: `key`, `title`, `version`, `url`, `message`, `truncated`.

## update_test_case

**Update a test case** · toolset `write` · **writes**

Change fields of a test case: title, steps, status, priority, suite, tags and the rest. Only the fields given change; every edit is a new version in its history.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `case` | string | yes | Test case key ("TC-12" or "12") or its id. |
| `title` | string |  |  |
| `suite` | string |  | Move to this suite (id or path; missing levels are created). "unassigned" removes it from its suite. |
| `addTags` | string[] |  | Adds tags, keeping the others. |
| `removeTags` | string[] |  |  |
| `expectedVersion` | integer (-9007199254740991–9007199254740991) |  | Refuse the edit if the case changed since this version (from get_test_case). |
| `description` | string |  | What the case checks, and why. |
| `preconditions` | string |  |  |
| `postconditions` | string |  |  |
| `stepsFormat` | `"classic"` \| `"gherkin"` |  | classic (action / test data / expected result) or gherkin. |
| `steps` | object[] |  | Replaces every step. |
| `status` | `"active"` \| `"draft"` \| `"deprecated"` |  |  |
| `priority` | `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"none"` |  |  |
| `severity` | `"blocker"` \| `"critical"` \| `"major"` \| `"normal"` \| `"minor"` \| `"trivial"` \| `"none"` |  |  |
| `type` | `"functional"` \| `"smoke"` \| `"regression"` \| `"integration"` \| `"e2e"` \| `"api"` \| `"unit"` \| `"performance"` \| `"security"` \| `"accessibility"` \| `"usability"` \| `"compatibility"` \| `"acceptance"` \| `"exploratory"` \| `"other"` |  |  |
| `behavior` | `"positive"` \| `"negative"` \| `"destructive"` \| `"none"` |  |  |
| `automation` | `"manual"` \| `"planned"` \| `"automated"` |  | manual, planned (to be automated) or automated. Linking a test sets automated by itself; prefer link_test_case. |
| `muted` | boolean |  |  |
| `tags` | string[] |  | Replaces every tag. |
| `customFields` | object |  | The project's custom fields, by key. |

Structured output fields: `key`, `title`, `version`, `url`, `message`, `truncated`.

## bulk_update_test_cases

**Update many test cases** · toolset `write` · **writes**

Apply one change to many test cases at once, as ticking cases in the list does: set the priority, status, severity, type, behavior, automation or suite of each, mute them, or add and remove tags. Each changed case gets a new version in its history.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `cases` | string[] | yes | The cases to change, by key ("TC-12") or id; at most 200. |
| `suite` | string |  | Move them to this suite (id or path; missing levels are created). "unassigned" takes them out of their suite. |
| `status` | `"active"` \| `"draft"` \| `"deprecated"` |  |  |
| `priority` | `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"none"` |  |  |
| `severity` | `"blocker"` \| `"critical"` \| `"major"` \| `"normal"` \| `"minor"` \| `"trivial"` \| `"none"` |  |  |
| `type` | `"functional"` \| `"smoke"` \| `"regression"` \| `"integration"` \| `"e2e"` \| `"api"` \| `"unit"` \| `"performance"` \| `"security"` \| `"accessibility"` \| `"usability"` \| `"compatibility"` \| `"acceptance"` \| `"exploratory"` \| `"other"` |  |  |
| `behavior` | `"positive"` \| `"negative"` \| `"destructive"` \| `"none"` |  |  |
| `automation` | `"manual"` \| `"planned"` \| `"automated"` |  |  |
| `muted` | boolean |  |  |
| `addTags` | string[] |  | Adds tags to each case, keeping the others. |
| `removeTags` | string[] |  |  |

Structured output fields: `updated`, `cases`, `message`, `truncated`.

## create_test_suite

**Create a test suite** · toolset `write` · **writes**

Create a suite, optionally under a parent suite, to group test cases the way the product is built.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `name` | string | yes |  |
| `parent` | string |  | Nest it under this suite (id or path). Suites nest at most 6 levels deep. |
| `description` | string |  |  |

Structured output fields: `id`, `path`, `message`, `truncated`.

## delete_test_suite

**Delete empty test suites** · toolset `write` · **writes**

Delete suites that hold no test cases, e.g. the ones left empty after moving cases elsewhere: the named suites, or every empty suite with allEmpty. Never deletes a case; a suite that still holds cases is refused.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `suites` | string[] |  | Suites to delete (id or path), with the suites below them. Refused if any of them still holds cases. |
| `allEmpty` | boolean |  | Instead: delete every suite that holds no cases, itself or below it. |

Structured output fields: `deleted`, `message`, `truncated`.

## link_test_case

**Link tests to a test case** · toolset `write` · **writes**

Link Playwright tests (by test id from find_tests) to a test case, or unlink them. A linked case is marked automated and shows the tests' results. A lasting link comes from code instead: tag the test with @TC-12.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `case` | string | yes | Test case key ("TC-12" or "12") or its id. |
| `link` | string[] |  | Test ids to link, from find_tests or list_test_cases. |
| `unlink` | string[] |  | Test ids to unlink. |

Structured output fields: `key`, `linked`, `unlinked`, `message`, `url`, `truncated`.

## adopt_tests

**Adopt Playwright tests as test cases** · toolset `write` · **writes**

Turn Playwright tests into test cases already linked to them: steps from their test.step() calls, one case per test across browsers. Give "tests" (one suite, or suites mirroring files and describe blocks), or "placements" to choose a suite and a title per test. A test that already backs a case is skipped.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `tests` | string[] |  | Test ids (from list_uncovered_tests or find_tests) to turn into test cases. |
| `suite` | string |  | With "tests": put every new case in this suite (id or path; created if missing). Omit to mirror each test's file and describe blocks as suites. |
| `placements` | object[] |  | Instead of "tests": each group of tests with its own suite and title, to sort many tests into existing or new suites in one call. |

Structured output fields: `created`, `skipped`, `message`, `truncated`.

## list_feedback_requests

**List open visual feedback requests** · toolset `core`

Start here to fix a product from visual feedback: every open request for a change on its screenshots — comment threads and "changes requested" without a comment — one record each, with the producing test (id, full title, file, browser), the checkpoint key, the image now and the one the request was made on, the whole conversation, and whether it waits for a fix or changed since (verify). Library scope by default, so screens a partial run skipped are included. Paged; counts cover all pages.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `branch` | string |  | The library reference: a branch, e.g. "feature/workshop-sessions". Pass the branch the work is on — do not rely on a default. |
| `pullRequest` | integer (–9007199254740991) |  | The library reference: a pull (merge) request number, instead of a branch. |
| `run` | integer (–9007199254740991) \| string |  | One run instead of the library (only its own captures: a partial run leaves screens out). |
| `stage` | `"all"` \| `"waiting"` \| `"verify"` |  | waiting: the image is still the one the request was made on. verify: it changed since — check it. Default all. |
| `test` | string |  | Part of a test title or file, to narrow the list. |
| `variant` | string |  | Only this variant, e.g. "desktop" or "mobile". |
| `limit` | integer (1–200) |  | Requests per page (1–200, default 50). |
| `cursor` | string |  | Opaque cursor from a previous response, for the next page. Keep the other filters unchanged. |

Structured output fields: `project`, `scope`, `pinnedRun`, `latestRun`, `counts`, `requests`, `producers`, `nextCursor`, `notes`, `truncated`.

## list_review_checkpoints

**List review checkpoints** · toolset `core`

A run's review checkpoints — the named screenshots its tests capture at their milestones, per variant (desktop, mobile) — in journey order, with each image's review status (changed against its approved baseline, new, approved or changes requested) its open comment threads, and its measured pixel change: how much of the image changed, in how many regions, whether the page changed size or its content moved. Changes within the project's tolerance are approved automatically (autoApproved). Defaults to what needs review. Look at one with get_review_checkpoint.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `run` | integer (–9007199254740991) \| string |  | The run (default "latest"). Scope "latest" with branch. |
| `branch` | string |  | Git branch name, e.g. "main". |
| `status` | `"needs-review"` \| `"all"` \| `"changed"` \| `"new"` \| `"changes_requested"` \| `"approved"` |  | needs-review (default: changed and new images), all, changed, new, changes_requested or approved. |
| `test` | string |  | Part of a test title or file, to narrow the list. |
| `variant` | string |  | Only this variant, e.g. "desktop" or "mobile". |

Structured output fields: `project`, `run`, `reviewUrl`, `counts`, `tests`, `truncated`.

## get_review_checkpoint

**Get a review checkpoint** · toolset `core`

One review checkpoint image to look at, beside the image it is compared with — the one a request was made on (against "origin"), the approved baseline, or the run before — with the measured change and close-ups of the largest changed regions. Open comment threads are drawn as numbered pins, a close-up per pin follows, and the threads are listed by the same numbers. images "focus" with a thread attaches just that spot, then and now: readable on tall pages, and small. Each attached image is described in attachedImages.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `capture` | string | yes | Capture id, from list_review_checkpoints, list_feedback_requests or list_review_threads. |
| `against` | `"auto"` \| `"origin"` \| `"baseline"` \| `"previous"` |  | What to compare with. origin: the image the focused thread (or a change request without a comment) was made on — what the request was about. baseline: the approved image. previous: the same checkpoint in the run before. auto (default): origin for a focused thread made on an earlier image, else the baseline, else the previous capture. |
| `againstCapture` | string |  | Compare with this capture id instead (any capture of the project), e.g. an original from list_feedback_requests. |
| `compare` | boolean |  | Attach the image compared with. Default true. |
| `images` | `"all"` \| `"focus"` \| `"none"` |  | all (default): the full images, then close-ups. focus: close-ups only — the focused thread on this image and on the one compared with (or the changed regions) — readable on tall pages and small. none: text only. |
| `maxImages` | integer (1–12) |  | At most this many images (default 8); the rest are listed as omitted. |
| `changes` | boolean |  | Attach close-ups of the measured changed regions (up to 3), this image’s crop then the reference’s. Default true. |
| `pins` | boolean |  | Draw the open comment threads on the image as numbered pins. Default true. |
| `thread` | integer (–9007199254740991) |  | Focus one comment thread by its number: its close-up is attached — on this image and on the one compared with — and its pin drawn even if resolved. |
| `pinCrops` | boolean |  | Attach a close-up around each pin. Default: when at most 6 threads are open. |
| `includeResolved` | boolean |  | Also list (and pin) resolved threads. Default false. |

Structured output fields: `project`, `captureId`, `test`, `checkpoint`, `variant`, `run`, `status`, `viewport`, `sameAsReference`, `reference`, `imageUrl`, `referenceUrl`, `comparison`, `diff`, `comparisonId`, `measuredComparisonId`, `changedRegions`, `note`, `image`, `annotatedImageUrl`, `reviewUrl`, `request`, `threads`, `attachments`, `attachedImages`, `omittedImages`, `truncated`.

## review_checkpoint

**Approve or reject review checkpoints** · toolset `write` · **writes**

Approve review checkpoint images, or ask for changes — with a comment, and on one image with pins that mark each change where it is. An approval holds for the exact pixels: later runs with the same image need no review. Only approve what you looked at with get_review_checkpoint.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `captures` | string[] | yes | Capture ids, from list_review_checkpoints. |
| `decision` | `"approved"` \| `"changes_requested"` | yes | approved, or changes_requested. |
| `comment` | string |  | Why — what should change. Opens a thread about the whole image with a change request. |
| `pins` | object[] |  | With changes_requested on one capture: pin each change where it is, in percent of the image, as a numbered thread. |
| `resolveThreads` | boolean |  | With approved: also resolve the images’ open threads (their changes are done). |
| `agent` | string |  | Your name as an agent, e.g. "Codex" or "Claude Code": your comments show as that agent, for the person whose access you use. Default: the connected app’s name. |

Structured output fields: `project`, `decided`, `decision`, `pinned`, `resolvedThreads`, `truncated`.

## list_review_threads

**List review comment threads** · toolset `core`

The comment threads people (or assistants) pinned on a run’s review images — change requests at a spot or an area of a screenshot — per image, by the number on the pin, with where each points (pixels, percent, CSS pixels) and the conversation. Open ones by default. With library, every screen of a branch or pull request as the library shows it, so feedback on screens a partial run skipped is included; placement "outdated" lists the feedback whose image changed since (ready to verify), "exact" what still waits for a change. See one pinned on its image with get_review_checkpoint and thread.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `run` | integer (–9007199254740991) \| string |  | The run (default "latest"). Scope "latest" with branch. Ignored with capture or library. |
| `branch` | string |  | Git branch name, e.g. "main". |
| `library` | boolean |  | The library’s screens instead of one run: every screen of branch (or pullRequest; default: the library’s default reference) as its newest run captured it, so feedback on screens a partial run skipped is included. |
| `pullRequest` | integer (–9007199254740991) |  | With library: a pull (merge) request number instead of a branch. |
| `capture` | string |  | Only this image’s threads. |
| `status` | `"open"` \| `"resolved"` \| `"all"` |  | open (default), resolved or all. |
| `placement` | `"exact"` \| `"outdated"` |  | exact: on the image as it is now (waiting for changes). outdated: placed on an earlier version that has changed since (ready to verify, then resolve). |
| `test` | string |  | Part of a test title or file, to narrow the list. |

Structured output fields: `project`, `run`, `reference`, `counts`, `images`, `truncated`.

## comment_on_review

**Comment on a review image** · toolset `write` · **writes**

Pin a comment thread on a review image — at a spot or an area (in percent of the image), or about the whole image — or reply to a thread by its number. Say what should change and where, as a reviewer would. Reply to report a fix only when the user asked you to — a write-scoped token is not that permission. Shown in the viewer as an AI agent’s comment (name yourself with agent), for the person whose access you use.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `capture` | string | yes | Capture id: one image, from list_review_checkpoints or list_review_threads. |
| `body` | string | yes | The comment: what should change, or the answer to the thread. |
| `thread` | integer (–9007199254740991) |  | Reply to this thread, by the number on its pin. Without it, a new thread. |
| `at` | object |  | Where a new thread points, in percent of the image: a spot, or an area with w and h. Without it, the whole image. |
| `agent` | string |  | Your name as an agent, e.g. "Codex" or "Claude Code": your comments show as that agent, for the person whose access you use. Default: the connected app’s name. |

Structured output fields: `project`, `captureId`, `action`, `thread`, `threadId`, `url`, `truncated`.

## resolve_review_thread

**Resolve or reopen a review comment thread** · toolset `write` · **writes**

Mark a comment thread on a review image resolved — or open again — by the image and the number on its pin, with an optional closing note. Resolve only what is done; when the user asked you to fix a thread, prefer replying with what you did and let the reviewer resolve it.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `capture` | string | yes | Capture id: one image, from list_review_checkpoints or list_review_threads. |
| `thread` | integer (–9007199254740991) | yes | The thread’s number: the one on its pin. |
| `status` | `"resolved"` \| `"open"` |  | resolved (default), or open to reopen it. |
| `comment` | string |  | A closing note: what was done, or why it is reopened. |
| `agent` | string |  | Your name as an agent, e.g. "Codex" or "Claude Code": your comments show as that agent, for the person whose access you use. Default: the connected app’s name. |

Structured output fields: `project`, `thread`, `status`, `changed`, `url`, `truncated`.

## list_visual_diffs

**List visual differences between two runs** · toolset `core`

Which review screens look different between two runs (or two branches / pull requests in the library), test by test — even when every test passed. For each screen: the exact base and head captures, whether they are identical, changed, not measured yet, only in one run or incompatible, the changed pixels before and after the checkpoint’s rules left areas out, and a comparisonId to pass to get_visual_diff and get_visual_diff_image. Measures pairs nobody measured yet; pending ones say so (ask again). Decides nothing.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `headRun` | integer (–9007199254740991) \| string |  | The run looked at (default: the latest run with review captures). Exactly one of the run pair or the library pair. |
| `baseRun` | integer (–9007199254740991) \| string |  | The run compared against (default: the newest earlier run with captures on the head run’s branch). |
| `headBranch` | string |  | Library mode: the branch looked at, every screen as its newest run shows it. |
| `headPullRequest` | integer (–9007199254740991) |  | Library mode: a pull request looked at. |
| `baseBranch` | string |  | Library mode: the branch compared against (default: the library’s default reference). |
| `basePullRequest` | integer (–9007199254740991) |  |  |
| `status` | `"changed"` \| `"all"` \| `"identical"` \| `"undetermined"` \| `"added"` \| `"not_captured"` \| `"incompatible"` |  | changed (default: changed and not measured yet), all, identical, undetermined, added, not_captured or incompatible. |
| `test` | string |  | Part of a test title or file. |
| `variant` | string |  | Only this variant, e.g. "desktop". |
| `ignore` | `"active"` \| `"ever"` \| `"applied"` \| `"suppressed"` \| `"fully-suppressed"` \| `"needs-review"` |  | Only screens whose rules (areas left out) are: active, ever, applied, suppressed, fully-suppressed or needs-review. |
| `limit` | integer (1–100) |  | Rows per page (default 50). |
| `cursor` | string |  | Opaque cursor from a previous response, for the next page. Keep the other filters unchanged. |

Structured output fields: `project`, `mode`, `base`, `head`, `counts`, `comparisons`, `nextCursor`, `note`, `truncated`.

## get_visual_diff

**Get a visual difference** · toolset `core`

One visual comparison in detail: the exact base and head captures and their runs, the test and checkpoint that produce the screen (file, title path, checkpoint key, step, URL), how the two were captured, and the measurement — raw changed pixels, what the checkpoint’s rules left out, what remains — with every changed region as D1, D2… (stable ids, rectangles in image pixels, which rules touch it). Pass a region id to get_visual_diff_image to look at it. States no cause: a changed name is an observation, not yet randomness.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `comparison` | string |  | The comparisonId from list_visual_diffs. |
| `base` | string |  | Instead of comparison: the capture id compared against. |
| `head` | string |  | Instead of comparison: the capture id looked at. |
| `policy` | `"raw"` \| `"effective"` |  | Whose regions to list: raw (default, before any rule left areas out) or effective (with the active rules). |
| `regionCursor` | string |  | From a previous answer, for the next page of regions. |
| `limit` | integer (1–200) |  | Regions per page (default 25). |

Structured output fields: `project`, `comparisonId`, `revision`, `base`, `head`, `test`, `checkpoint`, `variant`, `capture`, `compatibility`, `comparisonStatus`, `calculationState`, `byteIdentical`, `rawChangedPixels`, `ignoredChangedPixels`, `effectiveChangedPixels`, `totalPixels`, `rawChangedPercent`, `effectiveChangedPercent`, `ignoredAreaPixels`, `sizeChanged`, `contentMoved`, `threshold`, `ignoreRuleRevision`, `rules`, `regions`, `regionsComplete`, `nextRegionCursor`, `retryAfterMs`, `reviewUrl`, `interpretation`, `note`, `truncated`.

## get_visual_diff_image

**Get images of a visual difference** · toolset `debug`

The pictures of one visual comparison, in the mode that reads best: the head with the regions boxed and numbered (annotated), base and head of one region side by side at full resolution so a changed name or price can be read (pair, with regionIds), the changed pixels painted red (highlight), the threshold mask, the colour difference, the two faded over each other (onion), or a plain crop. Long regions come tiled, never shrunk; one image per call is described in images[] with the rectangle it shows. Start with annotated + overview, then pair for the regions you care about.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `comparison` | string | yes | The comparisonId. |
| `revision` | string |  | From get_visual_diff: the call fails with REVISION_CONFLICT if the rules or settings changed since. |
| `mode` | `"annotated"` \| `"pair"` \| `"highlight"` \| `"mask"` \| `"difference"` \| `"onion"` \| `"base"` \| `"head"` |  | annotated (default): head with regions boxed D1, D2…; pair: base and head of each region, readable; highlight: changed pixels painted; mask: white where changed; difference: colour difference; onion: head faded over base; base / head: as they are. |
| `scope` | `"overview"` \| `"regions"` \| `"crop"` |  | overview (whole image, scaled down), regions (each region at full resolution with context; default for pair), crop (one rectangle). |
| `regionIds` | string[] |  | With scope regions: which regions (ids or labels like "D2"). Default: the first ones in order. |
| `order` | `"reading"` \| `"largest"` |  | Which regions come first without regionIds: reading order (default) or the most changed pixels. |
| `crop` | object |  |  |
| `policy` | `"raw"` \| `"effective"` |  | raw (default) or effective: whose changed pixels highlight/mask paint and whose regions are boxed. |
| `showIgnored` | boolean |  | Hatch the areas left out on annotated images. Default true. |
| `contextPadding` | integer (0–400) |  | Context around a region, in CSS pixels (default 24). |
| `maxImages` | integer (1–8) |  | At most this many images (default 3). Regions that do not fit are named in nextRegionIds. |
| `maxBytes` | integer (16384–9007199254740991) |  | Per image; the server has its own ceiling. |
| `delivery` | `"inline"` \| `"links"` |  | inline (default): the images attached. links: short-lived signed links instead (what the REST API returns). |

Structured output fields: `project`, `comparisonId`, `revision`, `mode`, `scope`, `policy`, `images`, `omitted`, `nextRegionIds`, `warnings`, `retryAfterMs`, `truncated`.

## list_library

**List the library** · toolset `core`

The visual documentation of the product: the branches and pull requests kept in the library (and the default branch), which run of each is shown — the newest, or a pinned one — and how many of the newest run’s images still wait for review. Read a reference’s screens with get_library_flows.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |

Structured output fields: `project`, `defaultReference`, `url`, `references`, `truncated`.

## get_library_flows

**Get library flows** · toolset `core`

The screens of a branch or pull request as the library shows them — every checkpoint as the newest run on it captured it, so partial runs never hide what they skipped: each flow (test) with its test cases and their priority, its checkpoints in journey order, and each variant’s capture id and review state (waiting for changes, ready to verify, needs review, updated, approved). Filter by state, priority or a view (e.g. view "to-fix" for open feedback on the screens as they are now). Look at an image with get_review_checkpoint. Defaults to the library’s default reference.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `branch` | string |  | A branch, e.g. "main". Leave both out for the library’s default reference. |
| `pullRequest` | integer (–9007199254740991) |  | A pull (merge) request number, e.g. 212. |
| `test` | string |  | Part of a test title, file or test case key (TC-12), to narrow the flows. |
| `view` | string |  | A library view: a built-in one ("all", "feedback", "to-fix", "to-verify", "to-review") or one of your saved views, by name or id. Its filters and order apply; state and priority given here replace the view's. |
| `state` | `"waiting"` \| `"verify"` \| `"needs-review"` \| `"updated"` \| `"approved"`[] |  | Only flows with a screen in any of these states: waiting (open comments or a change request on the screen as it is now), verify (commented on an earlier version, the screen changed since), needs-review, updated (changed since the capture before it), approved. |
| `priority` | `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"none"`[] |  | Only flows whose highest linked test case priority is one of these ("none": no case, or no priority). |
| `sort` | `"journey"` \| `"priority"` \| `"urgency"` \| `"recent"` \| `"comments"` |  | journey (suite and file order, the default), priority, urgency, recent or comments. |
| `limit` | integer (1–500) |  | At most this many flows (default 50). |

Structured output fields: `project`, `reference`, `name`, `pinnedRun`, `url`, `view`, `total`, `more`, `flows`, `truncated`.

## set_library_reference

**Keep or pin a library reference** · toolset `write` · **writes**

Keep a branch or pull request in the library (a long-lived pull request can stay browsable while it is open), pin the run that documents it, make it the default, name it — or take it out. Needs a branch or pull request.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project. |
| `format` | `"markdown"` \| `"json"` |  | Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON). |
| `maxChars` | integer (1000–100000) |  | Character budget for this answer (default 20000). |
| `branch` | string |  | A branch, e.g. "main". Leave both out for the library’s default reference. |
| `pullRequest` | integer (–9007199254740991) |  | A pull (merge) request number, e.g. 212. |
| `keep` | boolean |  | false takes it out of the library. Default: keep it. |
| `pin` | integer (–9007199254740991) \| string |  | A run number to pin as the version shown, or "latest" to follow the newest run. |
| `default` | boolean |  | true makes it the reference the library opens on. |
| `title` | string |  | What readers call it, e.g. "Checkout redesign". Empty clears it. |
| `description` | string |  | A sentence on what it shows. Empty clears it. |

Structured output fields: `project`, `reference`, `kept`, `url`, `truncated`.

## Prompts

| Prompt | Arguments | Purpose |
|---|---|---|
| `triage_run` | `project?`, `run?` | Group a red run’s failures by root cause and get an ordered fix list, noting which failures are new. |
| `debug_test` | `project?`, `test`, `run?` | Find out why one test fails and what change fixes it, then how to confirm the fix. |
| `investigate_flake` | `project?`, `test` | Decide whether a test is flaky or broken, classify the defect, and propose a stabilisation. |
| `branch_check` | `project?`, `branch` | Compare a branch’s latest run with the base branch and get a go / no-go. |
| `fix_visual_feedback` | `project?`, `branch?`, `pullRequest?`, `reply?` | Work through every open request on a branch’s screenshots: trace each to its code, fix it, re-run only the producing tests, and check the new images against the originals. |
| `investigate_visual_diffs` | `project?`, `head?`, `base?`, `fix?` | Find out why screens look different between two runs that may both be green, region by region, down to the test and code that produce them — without changing anything. |
| `organize_tests` | `project?`, `search?` | Sort the Playwright tests no test case covers yet into existing or new cases and suites. |

## Resources

| URI | Content |
|---|---|
| `pwr://guide` | How to use the tools: identifiers, verdicts, paging, safety. |
| `pwr://projects/{team}/{project}/runs/{number}` | A run summary in markdown. |
| `pwr://artifacts/{attachmentId}` | An artifact’s bytes (access-checked on every read). |
