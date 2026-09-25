import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { debugPrompt, triagePrompt } from '../lib/ai-handoff';
import { DebugWithAiMenu } from './debug-with-ai-menu';

const RESULT_URL = 'https://reporter.acme.test/teams/acme/projects/web/runs/128/tests/0b6f3c1e';

const meta = {
  title: 'Patterns/DebugWithAiMenu',
  component: DebugWithAiMenu,
  args: { prompt: debugPrompt({ resultUrl: RESULT_URL }), setupHref: '/account/ai' },
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof DebugWithAiMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** On a run page the prompt asks for triage across every failure instead of one result. */
export const TriageARun: Story = {
  args: { prompt: triagePrompt({ runUrl: 'https://reporter.acme.test/teams/acme/projects/web/runs/128' }), label: 'Triage with AI' },
};

/**
 * Opening the menu offers every hand-off. The deep links carry the same
 * prompt as the clipboard, and the setup item goes to the host's page — both
 * are anchors, so they open like links rather than running script.
 */
export const OffersEveryHandOff: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /debug with ai/i }));

    // The popup animates in, so wait for it rather than asserting mid-transition.
    const copy = await body.findByRole('menuitem', { name: /copy prompt/i });
    await waitFor(() => expect(copy).toBeVisible());
    const claudeCode = body.getByRole('menuitem', { name: /open in claude code/i });
    const codex = body.getByRole('menuitem', { name: /open in codex/i });
    const cursor = body.getByRole('menuitem', { name: /open in cursor/i });
    const vscode = body.getByRole('menuitem', { name: /open in vs code/i });
    const setup = body.getByRole('menuitem', { name: /set up an assistant/i });

    await expect(claudeCode.tagName).toBe('A');
    await expect(new URL(claudeCode.getAttribute('href')!).searchParams.get('q')).toBe(args.prompt);
    await expect(new URL(codex.getAttribute('href')!).searchParams.get('prompt')).toBe(args.prompt);
    await expect(cursor.tagName).toBe('A');
    await expect(new URL(cursor.getAttribute('href')!).searchParams.get('text')).toBe(args.prompt);
    await expect(vscode.getAttribute('href')).toMatch(/^vscode:\/\/GitHub\.Copilot-Chat\/chat\?prompt=/);
    await expect(setup.getAttribute('href')).toBe('/account/ai');
  },
};

/** Copying writes the prompt — only the prompt — and confirms with a toast. */
export const CopiesThePrompt: Story = {
  play: async ({ canvasElement, args }) => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    const body = within(document.body);

    await userEvent.click(within(canvasElement).getByRole('button', { name: /debug with ai/i }));
    await userEvent.click(await body.findByRole('menuitem', { name: /copy prompt/i }));

    await expect(written).toEqual([args.prompt]);
    const toast = await body.findByText(/prompt copied/i);
    await waitFor(() => expect(toast).toBeVisible());
    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument());
  },
};
