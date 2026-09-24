import type { Meta, StoryObj } from '@storybook/react';
import { envSnippet, reporterSnippet } from '../fixtures/marketing';
import { CodeTabs } from './code-tabs';
import { Steps } from './steps';

const meta = {
  title: 'Marketing/Steps',
  component: Steps,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    header: { eyebrow: 'How it works', heading: 'Four moving parts, none of them yours to babysit' },
    steps: [
      {
        title: 'The reporter runs inside CI',
        description: <p>One entry in <code>playwright.config.ts</code>. It reads git and CI metadata itself.</p>,
      },
      {
        title: 'Results stream to the ingest API',
        description: <p>Token-authenticated, batched, and resumable if the job is retried.</p>,
      },
      {
        title: 'Postgres keeps the history, blob storage keeps the artifacts',
        description: <p>Both are yours. Neon and Vercel Blob in the default deployment.</p>,
      },
      {
        title: 'The UI updates live over SSE',
        description: <p>Progress, counts and per-shard state, while the job is still running.</p>,
      },
    ],
  },
} satisfies Meta<typeof Steps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The get-started page: every step carries the command it is describing. */
export const WithCode: Story = {
  args: {
    header: { heading: 'Running in five minutes' },
    steps: [
      {
        title: 'Add the reporter',
        aside: <CodeTabs tabs={[{ label: 'playwright.config.ts', code: reporterSnippet }]} />,
      },
      {
        title: 'Point it at your deployment',
        aside: <CodeTabs tabs={[{ label: '.env', code: envSnippet }]} />,
      },
      { title: 'Run your suite', description: <p>The run appears before the first test finishes.</p> },
    ],
    link: { href: '/get-started', label: 'Full setup guide' },
  },
};

/** The minimum: two steps, no descriptions. */
export const Minimal: Story = {
  args: {
    header: null,
    steps: [{ title: 'Install' }, { title: 'Run' }],
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
