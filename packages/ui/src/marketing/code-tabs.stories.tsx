import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { envSnippet, reporterSnippet } from '../fixtures/marketing';
import { CodeTabs } from './code-tabs';

const ciSnippet = `- name: Run Playwright
  run: pnpm exec playwright test
  env:
    PW_REPORTER_URL: \${{ vars.PW_REPORTER_URL }}
    PW_REPORTER_TOKEN: \${{ secrets.PW_REPORTER_TOKEN }}`;

const meta = {
  title: 'Marketing/CodeTabs',
  component: CodeTabs,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    tabs: [
      { label: 'playwright.config.ts', code: reporterSnippet },
      { label: '.env', code: envSnippet },
      { label: 'GitHub Actions', code: ciSnippet },
    ],
    caption: 'No upload step. Results stream while the run executes.',
  },
} satisfies Meta<typeof CodeTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleTab: Story = {
  args: { tabs: [{ label: 'playwright.config.ts', code: reporterSnippet }], caption: null },
};

/**
 * Pre-highlighted markup, the way the website supplies it: Shiki runs on the
 * server and both themes' HTML is in the document.
 */
export const PreHighlighted: Story = {
  args: {
    tabs: [
      {
        label: 'shell',
        code: 'pnpm db:migrate',
        html: {
          light: '<pre><code><span style="color:#005cc5">pnpm</span> <span style="color:#24292e">db:migrate</span></code></pre>',
          dark: '<pre><code><span style="color:#79b8ff">pnpm</span> <span style="color:#e1e4e8">db:migrate</span></code></pre>',
        },
      },
    ],
  },
};

export const SwitchesTabs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: '.env' }));
    await expect(canvas.getByRole('tab', { name: '.env' })).toHaveAttribute('aria-selected', 'true');
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
