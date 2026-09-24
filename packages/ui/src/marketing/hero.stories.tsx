import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { githubCta, heroLead, primaryCta, reporterSnippet, screenshotPair } from '../fixtures/marketing';
import { BrowserFrame } from './browser-frame';
import { CodeTabs } from './code-tabs';
import { Hero } from './hero';
import { LiveRunDemo } from './live-run-demo';
import { ThemedImage } from './themed-image';

const meta = {
  title: 'Marketing/Hero',
  component: Hero,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    eyebrow: 'Self-hosted · Open source',
    heading: 'Every Playwright run, kept.',
    lead: <p>{heroLead}</p>,
    links: [primaryCta, githubCta],
  },
} satisfies Meta<typeof Hero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The home page: the claim on the left, a run filling up on the right. */
export const SplitWithDemo: Story = {
  args: {
    variant: 'split',
    visual: (
      <BrowserFrame url="reports.example.com/acme/web/runs">
        <div className="p-4">
          <LiveRunDemo />
        </div>
      </BrowserFrame>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Every Playwright run, kept.');
  },
};

export const SplitWithScreenshot: Story = {
  args: {
    variant: 'split',
    visual: (
      <BrowserFrame url="reports.example.com/acme/web/runs/481">
        <ThemedImage sources={screenshotPair} priority sizes="(min-width: 1024px) 50vw, 100vw" />
      </BrowserFrame>
    ),
  },
};

/** The inner pages: no visual, and the setup snippet does the persuading. */
export const Centered: Story = {
  args: {
    variant: 'centered',
    heading: 'Point it at a Neon branch and run the demo.',
    snippet: (
      <CodeTabs
        tabs={[{ label: 'playwright.config.ts', code: reporterSnippet }]}
        caption="No upload step. Results stream while the run executes."
      />
    ),
  },
};

/** A headline that wraps to three lines, which is the length to design for. */
export const LongText: Story = {
  args: {
    heading: 'Every Playwright run, kept — with its trace, its video and its history',
  },
};

export const Mobile: Story = {
  args: { variant: 'split', visual: <BrowserFrame><div className="p-4"><LiveRunDemo /></div></BrowserFrame> },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
