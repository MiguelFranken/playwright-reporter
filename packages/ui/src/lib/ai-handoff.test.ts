import { describe, expect, it } from 'vitest';
import {
  claudeCodePromptLink,
  codexPromptLink,
  cursorPromptLink,
  debugPrompt,
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
