/**
 * Hand-off prompts and deep links for the "Debug with AI" menu.
 *
 * A prompt names only its **scope** — the URL of a result or a run — and never
 * the test data behind it. The assistant pulls the evidence itself through the
 * MCP server, so a copied prompt cannot go stale, cannot leak an error message
 * into a chat log the user did not mean to share, and stays short enough for a
 * deep link. The server resolves these URLs back to a result or a run.
 *
 * No JSX and no directive: the pages that decide whether to show the menu build
 * the prompt on the server (see AGENTS.md, trap 2).
 */

import { MCP_SERVER_NAME } from './mcp-setup';

/** A prompt that asks the assistant to debug one failing or flaky result. */
export function debugPrompt({ resultUrl }: { resultUrl: string }): string {
  return (
    `Use the ${MCP_SERVER_NAME} MCP server to debug this failing test: ${resultUrl}\n\n` +
    'Start with get_failure_context, then look at more evidence only if you need it. ' +
    'Explain the most likely cause, and do not propose fixes that the evidence rules out.'
  );
}

/** A prompt that asks the assistant to triage every failure in one run. */
export function triagePrompt({ runUrl }: { runUrl: string }): string {
  return (
    `Use the ${MCP_SERVER_NAME} MCP server to triage the failures in this run: ${runUrl}\n\n` +
    'Start with summarize_failures, group the failures by likely cause, and say which ones are new ' +
    'and which were already failing on the base branch. Do not propose fixes that the evidence rules out.'
  );
}

/**
 * A prompt that asks the assistant to sort the Playwright tests no test case
 * covers yet into existing or new cases and suites. Scoped by the project's
 * test case library URL; it needs a token that may edit test cases.
 */
export function organizePrompt({ casesUrl }: { casesUrl: string }): string {
  return (
    `Use the ${MCP_SERVER_NAME} MCP server to organize the Playwright tests that no test case covers yet in this project: ${casesUrl}\n\n` +
    'Call list_uncovered_tests (follow nextCursor to the end), list_test_suites and list_test_cases. For each test decide: ' +
    'if it automates an existing case, link its testIds to that case with link_test_case instead of creating a duplicate; ' +
    'otherwise it becomes a new case in the existing suite that matches its product feature, or in a new suite, nested where it belongs, ' +
    'when nothing fits and the feature is clearly distinct. Give each new case a title that says what it verifies, in the style of the existing cases.\n\n' +
    'Show me the plan as a table (test → existing case, or new case title and suite) and wait for my go. ' +
    'Then apply it with one adopt_tests call using "placements" (one per test, with all of its testIds, its suite and its title) ' +
    'and the link_test_case calls, remove suites left empty with delete_test_suite allEmpty, and give me the links to the new cases.'
  );
}

/**
 * A prompt that asks the assistant to make the changes review comments ask
 * for on one screenshot. Scoped by the capture (and the project, when the
 * connection may have none by default) and the comments' numbers: the
 * assistant reads the image, its pins and close-ups through the MCP server.
 * It replies on each thread and leaves resolving to a person, who checks the
 * next run's screenshot.
 */
export function fixCommentsPrompt({ captureId, threads, project, screen }: { captureId: string; threads: readonly number[]; project?: string | null; screen?: string | null }): string {
  const which = threads.length === 1 ? `comment #${threads[0]}` : threads.length ? `comments ${threads.map((n) => `#${n}`).join(', ')}` : 'the open comments';
  return (
    `Use the ${MCP_SERVER_NAME} MCP server to make the changes asked for in ${which} on this screenshot${screen ? ` (${screen})` : ''}: ` +
    `capture ${captureId}${project ? ` in project ${project}` : ''}.\n\n` +
    `Call get_review_checkpoint with capture "${captureId}" to see the image with the open comments as numbered pins and a close-up of each. ` +
    'For each comment, find the component or styles in this codebase that render that part of the screen and make the change it asks for — nothing beyond it. ' +
    'Then tell me what you changed, per comment number, and reply on each thread with comment_on_review — with agent set to your name — saying what changed and where. ' +
    'Do not resolve the threads: a person resolves them after checking the next run’s screenshot.'
  );
}

/**
 * A prompt that asks the assistant to find out why one screen looks different
 * between two captures — read-only. Scoped by the comparison id (the two
 * captures) and the project; the assistant reads the measurement, the regions
 * and the images through the MCP server, and follows the checkpoint key into
 * the repository it runs in. It changes nothing: observation, hypothesis and
 * proven cause stay apart, and a changed screen is never an approval.
 */
export function investigateVisualDiffPrompt({ comparisonId, project, screen }: { comparisonId: string; project?: string | null; screen?: string | null }): string {
  return (
    `Use the ${MCP_SERVER_NAME} MCP server to investigate the visual difference in comparison ${comparisonId}${screen ? ` (${screen})` : ''}${project ? ` in project ${project}` : ''}.\n\n` +
    `Call get_visual_diff with comparison "${comparisonId}" first: it names the base and head captures and their runs, the test and checkpoint key that produce the screen, ` +
    'the measurement raw and with the checkpoint’s rules (areas left out) applied, and the changed regions D1, D2… Then call get_visual_diff_image with mode "annotated" and scope "overview" ' +
    'to see where the regions are, and mode "pair" with the regionIds you want to read, then and now, at full resolution. Both runs may be green. ' +
    'For each region keep apart what you observe (a different text at the same place), what you suspect (a random fixture name, a date or clock, another user, a sort order, a rendering difference, a real change) ' +
    'and what the code in this repository proves: search for the checkpoint key, follow the test into its fixtures and data setup and into the UI that renders the region. ' +
    'Change no code, no rules and no review decisions. Report per region, with the capture and run references, what you would change and where.'
  );
}

/**
 * A prompt that asks the assistant to fix the cause of a visual difference in
 * the repository it runs in — a seeded fixture, a frozen clock, a stable
 * sort — and to verify with the producing tests. It may not add rules that
 * leave areas out, approve images or resolve threads: those are a person's.
 */
export function fixVisualDiffPrompt({ comparisonId, regionIds, project, screen }: { comparisonId: string; regionIds: readonly string[]; project?: string | null; screen?: string | null }): string {
  const which = regionIds.length === 1 ? `region ${regionIds[0]}` : regionIds.length ? `regions ${regionIds.join(', ')}` : 'every changed region';
  return (
    `Use the ${MCP_SERVER_NAME} MCP server to find and fix the cause of the visual difference in comparison ${comparisonId}${screen ? ` (${screen})` : ''}${project ? ` in project ${project}` : ''}, ${which}.\n\n` +
    `Call get_visual_diff with comparison "${comparisonId}", then get_visual_diff_image with mode "pair"${regionIds.length ? ` and regionIds ${JSON.stringify(regionIds)}` : ''} to read each region then and now ` +
    '(mode "annotated" with scope "overview" shows where they are). Follow the checkpoint key to the test, its fixtures and the UI code in this repository. ' +
    'Stabilise unintended randomness or time dependence at its source — a seeded fixture, a frozen clock, a stable sort — without changing test titles or checkpoint keys; treat a real UI regression as one and say so. ' +
    'Re-run only the producing tests and compare the new captures with the base (get_visual_diff with base and head capture ids); two independent runs show stability, one does not. ' +
    'Do not add rules that leave areas out, approve images or resolve threads unless I ask: say what you would propose instead. Report the files changed, the runs, and what stays uncertain.'
  );
}

/**
 * A prompt that asks the assistant to go through every screen of a run that
 * looks different from the run before it (or from `baseRun`), both possibly
 * green. Scoped by the run URL; the tools resolve it.
 */
export function investigateRunVisualDiffsPrompt({ runUrl, baseRun }: { runUrl: string; baseRun?: number | null }): string {
  return (
    `Use the ${MCP_SERVER_NAME} MCP server to investigate the visual differences of this run${baseRun ? ` against run #${baseRun}` : ' against the run before it'}: ${runUrl}\n\n` +
    `Call list_visual_diffs with headRun set to this run${baseRun ? ` and baseRun ${baseRun}` : ' (baseRun defaults to the newest earlier run with captures on its branch)'}. ` +
    `For each image's review status since that run (unchanged, changed or new, whatever was approved), call list_review_checkpoints with against ${baseRun ? baseRun : '"previous"'}, and get_review_checkpoint with ${baseRun ? `againstRun ${baseRun}` : 'against "previous"'}. ` +
    'For each changed screen call get_visual_diff with its comparisonId, then get_visual_diff_image with mode "annotated" and scope "overview", and mode "pair" with regionIds to read what changed. ' +
    'Both runs may be green: a changed screen is evidence, not a defect. Search this repository for each checkpoint key and follow the test into its fixtures and the UI code. ' +
    'Group the screens by cause (random test data, time, a real change, rendering noise), say what the code proves and what stays a hypothesis, and change nothing yet.'
  );
}

/**
 * Opens a new Claude Code terminal session with the prompt pre-filled; the user still presses Enter.
 *
 * verify: Claude Code documents `claude-cli://open?q=…` (v2.1.91+, `q` up to 5,000 characters,
 * https://code.claude.com/docs/en/deep-links). The handler registers itself after the first interactive prompt.
 */
export function claudeCodePromptLink(prompt: string): string {
  return `claude-cli://open?q=${encodeURIComponent(prompt)}`;
}

/**
 * Opens a new Codex chat (the desktop app) with the prompt in the composer; the user still sends it.
 *
 * verify: Codex documents `codex://new?prompt=…` for a new local chat
 * (https://learn.chatgpt.com/docs/reference/commands). Re-check the host and parameter name if Codex changes it.
 */
export function codexPromptLink(prompt: string): string {
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}

/**
 * Opens Cursor's chat with the prompt pre-filled; the user still presses send.
 *
 * verify: Cursor documents `cursor://anysphere.cursor-deeplink/prompt?text=…` for prompt deeplinks
 * (https://docs.cursor.com/deeplinks). Re-check the path and parameter name if Cursor changes its scheme.
 */
export function cursorPromptLink(prompt: string): string {
  return `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`;
}

/**
 * Opens GitHub Copilot Chat in VS Code with the prompt pre-filled.
 *
 * verify: `vscode://GitHub.Copilot-Chat/chat?prompt=…` is the Copilot Chat extension's URI handler, not a
 * documented VS Code contract. Re-check the handler path and parameter name against the extension.
 */
export function vscodePromptLink(prompt: string): string {
  return `vscode://GitHub.Copilot-Chat/chat?prompt=${encodeURIComponent(prompt)}`;
}

/** One assistant the menu can hand a prompt to through a deep link. */
export type PromptHandoffTarget = {
  id: string;
  label: string;
  link: (prompt: string) => string;
};

/**
 * Every assistant the "Debug with AI" menu offers, in menu order — the most used first.
 * Adding an assistant is one entry here plus a link builder above.
 */
export const PROMPT_HANDOFF_TARGETS: readonly PromptHandoffTarget[] = [
  { id: 'claude-code', label: 'Claude Code', link: claudeCodePromptLink },
  { id: 'codex', label: 'Codex', link: codexPromptLink },
  { id: 'cursor', label: 'Cursor', link: cursorPromptLink },
  { id: 'vscode', label: 'VS Code', link: vscodePromptLink },
];
