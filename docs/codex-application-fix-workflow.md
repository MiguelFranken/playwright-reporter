# Codex application-fix workflow: MCP and visual review UX

Status: implementation analysis and proposed product requirements, 30 September 2026. This document does not change runtime behavior. It is intended for future agents and developers improving Playwright Reporter.

## Why this document exists

Codex used the deployed Reporter MCP to implement visual feedback in the current application checkout, `fluid-bodies/workshops`, branch `feature/workshop-sessions`. The Reporter repository inspected for this document is `/Users/mfranken/Documents/Work/playwright-reporter`, on `main`. Those are separate repositories and separate branch scopes: do not use the Reporter's Git branch to choose the application's feedback.

The task was to discover every open request, inspect its original screenshot, pin and conversation, trace it into application code, fix the cause, run only its exact producing tests in local production mode, and inspect the uploaded replacements. Comments had to remain open for human validation.

This is a workflow for fixing the application through test evidence. The six producing tests were already passing before the work; behavioral failure triage alone would not have found the visual requests. An assistant needs feedback discovery and image comparison even when the run is green.

The recommendations below distinguish observed session friction, confirmed local implementation details, and proposed changes. The deployed tools and this checkout can differ in version. Read current tool schemas before calling them; do not assume this document introduces new tools or arguments.

## Current implementation map

Paths in this table are relative to this repository.

| Layer | Source | Responsibility relevant to the workflow |
| --- | --- | --- |
| Installed Playwright reporter | `packages/reporter/src/index.ts`, `metadata.ts`, `checkpoints.ts`, `review.ts`, `client.ts` | Builds run metadata, transports events and attachments, maps review records or legacy `review:<name>:<variant>` attachments into checkpoints. List mode is suppressed. Checkpoint records preserve capture identity, variants and step context. |
| Wire contract | `packages/protocol/src/` | Shared schemas/types between the installed reporter and server. Add ingestion metadata here deliberately rather than inventing MCP-only facts. |
| Remote endpoint | `apps/web/app/api/mcp/route.ts`, `apps/web/lib/mcp/http.ts` | Instance/env enablement, host/origin validation, bearer auth, SDK HTTP handling. A fresh server is built for each request. Legacy clients are stateless; modern responses use JSON. |
| Authentication and access | `apps/web/lib/mcp/auth.ts`, `context.ts`, `server.ts` | OAuth/PAT verification and project permissions. Ingest tokens are rejected for MCP. Explicit project arguments take precedence over inferred defaults. Write tools require a write-scoped grant; individual handlers still enforce access. |
| Tool contract and execution | `apps/web/lib/mcp/registry.ts`, `tools/index.ts` | Zod input/output schemas, annotations, rate limits, cancellation signal, budgeted rendering, error mapping and tool-call telemetry. Success returns text plus structured data and optional native images. |
| Agent guidance | `apps/web/lib/mcp/guide.ts`, `prompts.ts`, `resources.ts` | Connect-time instructions, `pwr://guide`, workflow prompts, run/artifact resource templates. Existing prompts focus on failure triage, debugging, flakes, branch checks and test organization; there is no dedicated visual-feedback repair prompt. |
| Visual discovery | `apps/web/lib/mcp/tools/library.ts`, `review-threads.ts`, `review.ts` | Library references and feedback filters; full thread conversations and original placements; review capture lookup, images, crops, decisions and links. |
| Persistent visual history | `apps/web/lib/review/library.ts`, `queries.ts`, `threads.ts`, `view-model.ts` | Capture history across runs, newest available variants, approval/feedback states and inherited thread placement. Library reads retain screens skipped by partial runs; checkpoints deliberately removed in a later successful captured flow have retirement rules. |
| Image delivery | `apps/web/lib/review/images.ts`, `annotate.ts`, MCP `tools/review.ts` | Storage access, re-encoding, annotated pins, pin/diff crops and pixel/percent/CSS coordinate conversion. Image bytes and text have different budget mechanisms. |
| Browser review UX | `packages/ui/src/views/review/thread-compare.tsx`, `checkpoint-viewer.tsx`, `review-storyboard.tsx`; connected wrappers in `apps/web/components/review/` | The UI already compares an original commented capture with the current image. Rendering belongs in the shared UI package; server/browser wiring belongs in the app. |
| Other API surfaces | `apps/web/lib/api/from-tool.ts`, `docs/mcp-tools.md` | REST endpoints reuse tool handlers and access logic, but return structured data without MCP rendering budgets. MCP tool documentation is generated; edit its sources and regenerate instead of editing the generated file. |
| Optional stdio bridge | `packages/mcp/src/bridge.ts`, `config.ts`, `cli.ts` | Transparent remote forwarding, not a second implementation of the tools. Mirrors schemas/instructions and supported capabilities, forwards cancellation/progress, disables unsupported subscriptions. Repository detection sends the origin remote, not a branch or working-tree contents. |

Keep improvements in the shared tool/review logic. Do not implement a different feedback model in the stdio bridge or REST adapter.

## Evidence from this session

1. Discovery started with explicit project and application branch, `list_library`, `get_library_flows(view: "feedback")` and `list_review_threads(library: true, status: "open")`. The most recent run was partial. Library discovery found six affected flows, including images from earlier runs that it had skipped.
2. The worklist contained ten open pinned threads plus one `changes_requested` email image with no note/thread. Inspecting the image exposed a missing space. The user confirmed that this was the only intended change. A thread-only queue would have missed that request.
3. Original desktop/mobile captures, pin crops and complete comments established eleven actionable requests. Changes involved coupon layout, a confirmation-grid border, refund-email text/spacing, cancellation cards/help placement and an email typo.
4. Physical source-line selectors did not consistently match Playwright's reported/transformed locations. A successful `--list` command silently selected fewer tests than intended. Verified end-anchored titles within end-anchored spec patterns selected all six producing tests. `coupon.spec.ts` without an end anchor also matches `incentive-coupon.spec.ts`.
5. One consolidated local-production invocation ran six unique tests in Chromium with one worker. Reporter uploaded [run 59](https://playwright-reporter-nine.vercel.app/teams/fluid-bodies/projects/workshops/runs/59). Every named screenshot was read back, including additional milestones produced by those tests.
6. Image inspection caught a new cancellation-page paragraph wrapping issue caused by the shared Link's default block mode. Only that test was rerun after correction; [run 60](https://playwright-reporter-nine.vercel.app/teams/fluid-bodies/projects/workshops/runs/60) passed. Test success alone had not established the visual result.
7. Final library discovery retained run 59's other flows while showing run 60's cancellation captures. Ten threads became outdated/ready to verify and stayed open. The uncommented change request no longer appeared in the feedback view after its replacement; its original identity still had to remain in the session worklist.
8. Full-page images at 2× scale were too tall for reliable text reading when reduced by the client. Pin crops helped. Large batches of image output exceeded conversation capacity; text `maxChars` cannot prevent that.
9. Both runs used the same Git SHA with uncommitted fixes. The local manifest's dirty-worktree flag supplied provenance that the run SHA alone could not. Local prod wrappers also set `CI=true`; the remote run labeled the executor `ci`, although execution was local.

These are session observations, not benchmark results across every MCP client. Videos were inspected through sampled frames rather than continuous playback; the visual verdicts came from the named screenshots.

## How Codex should complete an application fix

### 1. Establish scope and a complete worklist

Read the application checkout's instructions, branch and dirty status. Use the user's project/branch/PR explicitly. A connection default, library default, or another open UI page must not replace that scope.

For visual requests, use the library rather than global `latest`:

```json
{"project":"fluid-bodies/workshops","branch":"feature/workshop-sessions","view":"feedback","format":"json","limit":200}
```

Pair `get_library_flows` with `list_review_threads` using the same branch, `library: true`, and `status: "open"`. Check `more`, `truncated`, counts and available paging/filtering until discovery is complete. Include change-requested captures with no threads; fetch their review note/image. Waiting and ready-to-verify are both candidates for investigation, not automatic permission to edit every screen.

Persist a worklist before changes. Each item needs thread ID/number or a capture-level request ID, full conversation, original/current capture and run, checkpoint key, variant/browser, full test identity, spec, stable viewer links, intended outcome and final verdict. Deduplicate by thread ID; do not lose items merely because they stop matching the discovery view.

### 2. Read evidence and trace its producing code

Fetch the original `placedOnCapture` for inherited feedback. Inspect native image blocks, pins and relevant crops, then inspect the current version. Coordinates at 2× image scale are not CSS coordinates. An outdated pin can point to the wrong place after layout moves.

Use `get_result` when file, browser, full test title or source location is ambiguous. Search the local spec for the checkpoint key and helper call, inspect fixture/state setup, then follow the route/component/email template and shared primitives. Historical reported lines are search clues, not guaranteed current source selectors. Preserve test titles and checkpoint keys when fixing rendering.

A passing test can expose a product defect in its screenshot. Fix the actual application owner; change tests/capture helpers only when they misrepresent correct behavior. Ask for intent only when image and conversation leave a material ambiguity, while continuing independent fixes.

### 3. Select and execute only the producers

Derive the allowed set from actionable worklist entries. Preview the exact command with Playwright `--list`; verify every full title/browser and the total against that set. If line selectors drift, use escaped, anchored titles restricted to escaped, anchored spec patterns and preview again. Account for title collisions; end anchoring alone is not proof of unique identity.

The consuming application's repository owns package-manager, database, build and prod/dev choices. Here, the user explicitly selected the isolated local-production wrapper; Reporter should expose identities and selectors rather than substitute a generic raw Playwright command for that launcher. A shared component change alone does not authorize a broad suite.

Check upload prerequisites without printing credentials. Consolidate exact tests where possible. Preserve local artifacts before a rerun if the consuming wrapper replaces them. Rebuild changed application code and repeat only tests needed for a concrete correction or unresolved result.

### 4. Verify execution, upload and the requested pixels separately

Use the exact uploaded run URL/number. Verify project, application branch, browser, selected identities, time and terminal counts with `get_run` and result/checkpoint reads. A log URL or green test result is not proof that every artifact is stored and available.

Read `list_review_checkpoints(status: "all")`; default needs-review filtering may omit images required for verification. Match each worklist item to its replacement by test/checkpoint/variant, fetch the image and inspect both viewports. Compare against the capture actually annotated, which may be neither the approved baseline nor the previous capture.

Keep four outcomes separate: test passed, artifact available, requested visual outcome satisfied, reviewer validated. Pixel differences and outdated placement establish change, not satisfaction. `verify_fix` judges test behavior after failures; it must not be presented as a visual-thread satisfaction verdict.

Read the same library reference again. A narrow rerun must preserve other flows' evidence. Leave thread resolution, approvals and library settings unchanged unless explicitly authorized. A token's write capability does not grant user permission to post replies. Include proposed replies in the report when posting is not authorized.

### 5. Handoff with durable evidence

Report every initial request, its source diagnosis, producing test, original/new viewer links and visual verdict. Distinguish ambiguity, missing evidence and failed validation. Keep exact run IDs, local mode, dirty provenance and coverage limits. Use stable viewer URLs for navigation, native tool images for inspection, and the consuming repository's artifact-reporting format for local screenshots/videos. Signed image URLs expire and should not be the only handoff.

## Prioritized Reporter UX improvements

These are proposals, not existing APIs. Keep existing clients and v1 REST contracts working; extend shared schemas rather than changing their meaning.

### P1: Make original-feedback comparison explicit and truthful

**Confirmed implementation gap:** `get_review_checkpoint` advertises a baseline-or-previous comparison, but its full comparison image is attached only when `capture.baseline` exists. `measuredAgainst` can use `capture.previous` for diff crops, while the full reference remains absent. The UI's `ThreadCompare` already provides the original-comment comparison concept.

Propose an optional explicit comparison target (capture ID, thread origin, approved baseline or previous). Return the selected target's capture/run/reason separately from the diff's measured target. For thread-origin comparison, use the original anchor; label carried-forward pins as historical hints. Never describe missing baseline bytes as a successful previous-image fallback.

Acceptance: a capture with no approval but a previous image supplies that previous image when requested; a thread from two runs earlier compares its original against the selected new capture, not an unrelated baseline. Missing/retained-away references are explicit. Add tests in `apps/web/test/integration/mcp/tools-review.test.ts` and `tools-review-threads.test.ts`, and reuse the UI comparison stories.

### P1: Expose a lossless actionable-request queue

Discovery currently requires joining library flows, thread lists and capture readbacks. Flow output provides human checkpoint labels but not the exact key/test identifiers and per-capture note/decision details needed to directly build the worklist.

Propose an additive compact queue or richer existing output with stable test ID/full title path, file, reported location, browser, exact checkpoint key, original/current capture IDs and runs, decision/note, all thread IDs and feedback origin. Include uncommented changes_requested images. Distinguish thread counts from capture-level requests and preserve waiting versus verification states.

Acceptance: a partial newest run still yields all eligible older requests; ten threads plus one uncommented request produce eleven request records, not ten or six. Counts and pagination refer to a documented scope. Pinned library references retain their intended semantics and disclose that newer evidence may exist.

### P1: Bound image output independently from text

`registry.ts` budgets text/structured content; native images are appended afterward. Image encoding has byte limits, but a single call can add a main image, baseline, region pairs and pin crops. Attachment descriptions are human labels rather than a precise one-record-per-image map; changed-region crops can fail independently.

Propose image-count/byte/pixel budgets and structured attachment descriptors: content index, role, capture/run, thread/region ID, source rectangle, attached dimensions and scale. Offer a focused crop/tile mode for tall pages with enough context around the target. Report omitted images and how to fetch them. Keep independent original images; a contact sheet is not a replacement.

Acceptance: a tall 2× page remains readable at the commented target without attaching many full pages. A caller can request one focused thread pair and map each image unambiguously. `maxChars` is not documented as an image budget.

### P1: Separate changed-without-note from completed feedback

The uncommented email request was easy to lose after its replacement left the feedback view. A changed capture is evidence to check, not proof that the original request was satisfied.

Propose explicit lineage for capture-level decisions/notes even without a thread, plus a current/original comparison entry and a reviewer-facing validation action. Offer the reviewer a reason field when requesting changes, while retaining compatibility with historical empty reasons. Let the assistant flag "needs clarification" without inventing a comment or resolving anything.

Acceptance: an original change request remains discoverable for verification after a new capture arrives, even without a pin; human resolution/approval remains a distinct action. Test both same-pixel and changed-pixel replacements.

### P2: Give narrow reruns reliable identity and selection previews

**Confirmed source limitation:** `analysis/rerun-command.ts` builds line selectors or a grep of unanchored titles; grep mode is not restricted to affected files. This session did not use `get_rerun_command`, so that generator did not cause our selection error. It nevertheless has the same risk class.

Return target identities, expected count, file/browser restrictions, a list-preview command and source-location provenance. Escape regexes and shell arguments. Offer title-based alternatives when line locations are stale; require the local caller to compare the preview against identities. Never promise that historical lines are exact for a changed checkout. Keep these selector helpers independent of the consuming app's launcher.

Acceptance: coupon.spec.ts cannot accidentally select incentive-coupon.spec.ts; same-title tests in two files remain scoped; transformed-line mismatch leads to an explicit fallback rather than silent omission. Extend `analysis/rerun-command.test.ts` and integration coverage before changing generated docs.

### P2: Make local uncommitted evidence and upload completeness visible

`metadata.ts` detects SHA/branch and last commit information; it does not collect a dirty flag. Executor detection can interpret a local wrapper's CI flag as CI. The session therefore relied on the consuming application's manifest to explain why fixes and originals shared a SHA.

Propose additive provenance fields for local/CI execution source, production/development mode when explicitly supplied, working-tree dirty state and an optional safe source fingerprint. Do not upload diffs, file contents or local paths by default. Distinguish run finalization from expected/uploaded/unavailable artifact counts. Show these in MCP and the run header so reviewers know what was actually exercised.

Acceptance: two local runs with the same SHA and dirty changes are visibly distinguishable from a committed CI run; failed artifact uploads cannot look like complete visual verification. Keep historical unknown values honest.

### P2: Provide recoverable paging and smaller agent guidance

`trimStructured` halves large arrays until output fits and marks truncation. This avoids malformed JSON, but library/thread discovery still needs callers to increase budgets or partition queries. `get_library_flows` uses limit/more rather than a cursor. The guide's general list-paging paragraph does not describe these exceptions. Rich output can also repeat JSON in both text and structured content if a client forwards both.

Propose deterministic cursor pagination for actionable requests and thread conversations, scoped totals/returned counts and a compact summary shape. Avoid dropping part of a conversation without continuation metadata. Keep per-tool descriptions focused on that tool; maintain broader workflows in server instructions/resources and a new visual-feedback prompt. Clients should forward one representation of structured data and the native images, not duplicate both JSON forms.

Acceptance: small budgets provide an explicit continuation path and do not claim completeness. Guide examples match each tool's real pagination. No permissions are broadened by a prompt.

## Suggested system guidance and prompt

Add a dedicated visual-feedback workflow in `guide.ts` / `prompts.ts`, with project and branch/PR inputs. The existing phrase "After fixing a thread, reply with what you did" should be qualified by user authorization, not merely token write scope.

Suggested concise guidance:

> For application visual fixes, discover feedback across the explicitly scoped library reference, including earlier captures skipped by partial runs and change requests without threads. Inspect the annotated original, full conversation and current image; trace the exact producing test/checkpoint into local rendering code. Preview and verify the narrow test set using the repository's launcher. After execution, use its exact uploaded run, verify artifact availability, and inspect each replacement against the commented original in the required variants. A passed test, pixel change or outdated thread is not a visual approval. Keep approvals/resolution with the reviewer and post comments only when authorized. Preserve and report every initial request, even if it leaves the feedback view.

This guidance should describe intent without hardcoding Fluid Bodies' package manager, database lifecycle or local wrapper into Reporter itself.

## Implementation boundaries and checks for later work

- Extend `tools/library.ts`, `review.ts`, `review-threads.ts` and shared review logic for feedback identity/comparison; leave the bridge transparent.
- Add provenance through `packages/protocol` and reporter ingestion, then surface it in tool schemas and UI. Do not infer dirty state from a SHA.
- Keep new rendering in `packages/ui` with stories for partial runs, missing origins, no-note requests, long conversations, multiple variants and tall pages. Thin app wrappers own actions and queries.
- Extend existing integration tests for library/review/thread/auth behavior. Preserve project/role/scope checks for every explicit comparison target and image crop.
- Regenerate `docs/mcp-tools.md` with `nub run mcp:docs` in `apps/web` after changing the tool registry; regenerate REST docs with `nub run api:docs` if applicable. Review additive v1 compatibility.
- Measure successful complete discovery, calls/bytes needed per request, readable image coverage, narrow-selection accuracy and reviewer validation separately. Existing tool-call telemetry records argument names, duration, text chars, truncation and outcome; avoid logging comments, titles, credentials or screenshot content to measure usage.

This analysis involved local source inspection and the preceding live tool session. It did not execute Reporter repository tests or validate a new implementation; only this documentation is added.

## Implementation status (30 September 2026)

The proposals above were implemented in pull request #72. What each became, so later work starts from it:

| Proposal | What exists now |
| --- | --- |
| P1 lossless request queue | `list_feedback_requests` (MCP, REST `GET /feedback-requests`): one record per open request — threads and uncommented change requests — with `requestId`, stage (`waiting` / `verify`), test id, full title path, file, reported line, browser, checkpoint key, current and original capture/run, the whole conversation and viewer links; `producers` lists the distinct producing tests of every page; cursor paging with counts over all pages. Library scope by default; notes say when a default reference was assumed or a pinned run hides newer ones. Logic in `apps/web/lib/review/feedback-requests.ts`. |
| P1 uncommented changes_requested | `ComparedCapture.request` (queries.ts) keeps the standing request per checkpoint and variant; `captureStates` puts a replaced one in `verify`, so it stays in the library's feedback views (UI and `get_library_flows`). The viewer shows a note: pin what should change, or compare with the version asked about. |
| P1 explicit comparison | `get_review_checkpoint` takes `against` (`auto` / `origin` / `baseline` / `previous`) or `againstCapture`, and reports `comparison` (role, capture, run, reason, available, identical) apart from the measured diff. With no approval the previous capture is attached (the old code attached nothing). Missing references are named, never substituted silently. |
| P1 image budget | `images` (`all` / `focus` / `none`) and `maxImages` (default 8, at most 12); `attachedImages` describes each image (role, capture, run, thread or region, source rectangle, attached size); `omittedImages` lists what the budget left out. `focus` with a thread sends that spot on the current and the compared image only. REST passes `images: "none"` and no longer encodes images it discards. |
| P2 narrow re-runs | `get_rerun_command`: files anchored and escaped (`coupon.spec.ts` no longer matches `incentive-coupon.spec.ts`), titles anchored within their file, `titles` style when lines are unknown, `listCommand` preview, `expected` count, per-test identity and selectors, collision notes, optional `launcher` prefix. |
| P2 provenance and completeness | The reporter sends `git.dirty` / `git.dirtyFiles` (a count, never paths) and `ci.detectedBy`; the `executor` option or `PW_REPORTER_EXECUTOR` overrides the `CI` flag. `get_run` returns `provenance` and `artifacts` (attachments by upload status, review images missing); the run header shows uncommitted changes and "CI flag set · provider unknown". |
| P2 paging and guidance | The guide documents per-tool paging, that `maxChars` never limits images, and that a write-scoped token is not permission to reply; `comment_on_review` says the same. New prompt `fix_visual_feedback` (project, branch or pull request, `reply`) walks the workflow above and posts nothing unless asked. |
| Browser review UX | The viewer draws a comment on the image it was placed on in side-by-side, walks through comments to verify with close-ups (`ThreadVerify`, which replaced `ThreadCompare`), groups comments by stage and hands open comments to an assistant ("Fix with AI"). |
