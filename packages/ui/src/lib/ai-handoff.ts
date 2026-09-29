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
