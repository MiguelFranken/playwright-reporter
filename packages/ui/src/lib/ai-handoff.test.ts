import { describe, expect, it } from 'vitest';
import {
  claudeCodePromptLink,
  codexPromptLink,
  cursorPromptLink,
  debugPrompt,
  fixCommentsPrompt,
  fixVisualDiffPrompt,
  investigateRunVisualDiffsPrompt,
  investigateVisualDiffPrompt,
  organizePrompt,
  PROMPT_HANDOFF_TARGETS,
  triagePrompt,
  vscodePromptLink,
} from './ai-handoff';

const RESULT_URL = 'https://reporter.acme.test/teams/acme/projects/web/runs/128/tests/0b6f3c1e';
const RUN_URL = 'https://reporter.acme.test/teams/acme/projects/web/runs/128';

describe('debugPrompt', () => {
  it('names the MCP server and the result URL as its scope', () => {
    const prompt = debugPrompt({ resultUrl: RESULT_URL });
    expect(prompt.startsWith(`Use the playwright-reporter MCP server to debug this failing test: ${RESULT_URL}`)).toBe(true);
  });

  it('asks for get_failure_context first and for no fixes the evidence rules out', () => {
    const prompt = debugPrompt({ resultUrl: RESULT_URL });
    expect(prompt).toContain('get_failure_context');
    expect(prompt).toMatch(/do not propose fixes that the evidence rules out/i);
  });

  it('carries no URL but the one it was given', () => {
    const urls = debugPrompt({ resultUrl: RESULT_URL }).match(/https?:\/\/\S+/g);
    expect(urls).toEqual([RESULT_URL]);
  });
});

describe('triagePrompt', () => {
  it('scopes to the run and starts from summarize_failures', () => {
    const prompt = triagePrompt({ runUrl: RUN_URL });
    expect(prompt).toContain(`triage the failures in this run: ${RUN_URL}`);
    expect(prompt).toContain('summarize_failures');
    expect(prompt.match(/https?:\/\/\S+/g)).toEqual([RUN_URL]);
  });
});

describe('deep links', () => {
  const prompt = debugPrompt({ resultUrl: RESULT_URL });

  it('encodes the prompt into a Claude Code deep link', () => {
    const link = claudeCodePromptLink(prompt);
    expect(link.startsWith('claude-cli://open?q=')).toBe(true);
    expect(new URL(link).searchParams.get('q')).toBe(prompt);
  });

  it('encodes the prompt into a Codex new-chat link', () => {
    const link = codexPromptLink(prompt);
    expect(link.startsWith('codex://new?prompt=')).toBe(true);
    expect(new URL(link).searchParams.get('prompt')).toBe(prompt);
  });

  it('encodes the prompt into a Cursor prompt deeplink', () => {
    const link = cursorPromptLink(prompt);
    expect(link.startsWith('cursor://anysphere.cursor-deeplink/prompt?text=')).toBe(true);
    expect(new URL(link).searchParams.get('text')).toBe(prompt);
  });

  it('encodes the prompt into a VS Code Copilot Chat link', () => {
    const link = vscodePromptLink(prompt);
    expect(link.startsWith('vscode://GitHub.Copilot-Chat/chat?prompt=')).toBe(true);
    expect(new URL(link).searchParams.get('prompt')).toBe(prompt);
  });

  it('leaves no raw space, newline or ampersand in the link', () => {
    for (const link of PROMPT_HANDOFF_TARGETS.map((target) => target.link(`${prompt}&x=1`))) {
      expect(link).not.toMatch(/\s/);
      expect(link.split('?')[1]).not.toContain('&');
    }
  });
});

describe('PROMPT_HANDOFF_TARGETS', () => {
  it('offers Claude Code, Codex, Cursor and VS Code, with unique ids', () => {
    expect(PROMPT_HANDOFF_TARGETS.map((target) => target.label)).toEqual(['Claude Code', 'Codex', 'Cursor', 'VS Code']);
    expect(new Set(PROMPT_HANDOFF_TARGETS.map((target) => target.id)).size).toBe(PROMPT_HANDOFF_TARGETS.length);
  });
});

describe('organizePrompt', () => {
  const CASES_URL = 'https://reporter.acme.test/teams/acme/projects/web/cases';

  it('scopes to the project and walks the organizing tools', () => {
    const prompt = organizePrompt({ casesUrl: CASES_URL });
    expect(prompt).toContain(`in this project: ${CASES_URL}`);
    for (const tool of ['list_uncovered_tests', 'list_test_suites', 'list_test_cases', 'link_test_case', 'adopt_tests', 'delete_test_suite']) expect(prompt).toContain(tool);
    expect(prompt.match(/https?:\/\/\S+/g)).toEqual([CASES_URL]);
  });

  it('asks for the plan before changing anything, and fits a deep link', () => {
    const prompt = organizePrompt({ casesUrl: CASES_URL });
    expect(prompt).toMatch(/wait for my go/);
    expect(encodeURIComponent(prompt).length).toBeLessThanOrEqual(5_000);
  });
});

describe('fixCommentsPrompt', () => {
  it('scopes to the capture and the comments, and leaves resolving to a person', () => {
    const prompt = fixCommentsPrompt({ captureId: 'cap_1', threads: [1, 3], project: 'acme/web', screen: 'Checkout › Filled in (desktop)' });
    expect(prompt).toContain('comments #1, #3 on this screenshot (Checkout › Filled in (desktop)): capture cap_1 in project acme/web.');
    expect(prompt).toContain('get_review_checkpoint with capture "cap_1"');
    expect(prompt).toContain('comment_on_review');
    expect(prompt).toMatch(/Do not resolve the threads/);
    expect(prompt.match(/https?:\/\/\S+/g)).toBeNull();
  });

  it('reads one comment, or every open one', () => {
    expect(fixCommentsPrompt({ captureId: 'c', threads: [2] })).toContain('in comment #2 on this screenshot: capture c.');
    expect(fixCommentsPrompt({ captureId: 'c', threads: [] })).toContain('in the open comments on');
  });
});

describe('visual diff prompts', () => {
  it('investigating scopes to the comparison, walks the tools and changes nothing', () => {
    const prompt = investigateVisualDiffPrompt({ comparisonId: 'vc_abc', project: 'acme/web', screen: 'Checkout › Summary (desktop)' });
    expect(prompt).toContain('comparison vc_abc (Checkout › Summary (desktop)) in project acme/web.');
    for (const tool of ['get_visual_diff', 'get_visual_diff_image']) expect(prompt).toContain(tool);
    expect(prompt).toMatch(/Change no code, no rules and no review decisions/);
    expect(prompt.match(/https?:\/\/\S+/g)).toBeNull();
    expect(encodeURIComponent(prompt).length).toBeLessThanOrEqual(5_000);
  });

  it('fixing names the regions and leaves rules and approvals to a person', () => {
    const prompt = fixVisualDiffPrompt({ comparisonId: 'vc_abc', regionIds: ['r1-2-3-4', 'r5-6-7-8'] });
    expect(prompt).toContain('regions r1-2-3-4, r5-6-7-8.');
    expect(prompt).toContain('regionIds ["r1-2-3-4","r5-6-7-8"]');
    expect(prompt).toMatch(/Do not add rules that leave areas out, approve images or resolve threads/);
    expect(fixVisualDiffPrompt({ comparisonId: 'vc_abc', regionIds: [] })).toContain('every changed region.');
    expect(encodeURIComponent(prompt).length).toBeLessThanOrEqual(5_000);
  });

  it('a run’s prompt carries only the run URL', () => {
    const prompt = investigateRunVisualDiffsPrompt({ runUrl: RUN_URL, baseRun: 127 });
    expect(prompt).toContain(`against run #127: ${RUN_URL}`);
    expect(prompt).toContain('list_visual_diffs');
    expect(prompt.match(/https?:\/\/\S+/g)).toEqual([RUN_URL]);
    expect(investigateRunVisualDiffsPrompt({ runUrl: RUN_URL })).toContain('against the run before it');
    // The statuses an agent reads follow the same comparison, never the approved baseline.
    expect(prompt).toContain('list_review_checkpoints with against 127');
    expect(prompt).toContain('get_review_checkpoint with againstRun 127');
    expect(investigateRunVisualDiffsPrompt({ runUrl: RUN_URL })).toContain('list_review_checkpoints with against "previous"');
  });
});
