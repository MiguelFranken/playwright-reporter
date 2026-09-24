import type { Meta, StoryObj } from '@storybook/react';
import { screenshotPair } from '../fixtures/marketing';
import { BrowserFrame } from './browser-frame';
import { FeatureShowcase } from './feature-showcase';
import { ThemedImage } from './themed-image';
import { RunSummaryDemo } from './demos/run-summary';

const screenshot = (
  <BrowserFrame url="reports.example.com/acme/web/runs/481">
    <ThemedImage sources={screenshotPair} sizes="(min-width: 1024px) 50vw, 100vw" />
  </BrowserFrame>
);

const meta = {
  title: 'Marketing/FeatureShowcase',
  component: FeatureShowcase,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    header: {
      eyebrow: 'Debugging',
      heading: 'Debug from the evidence, not the log',
      intro: <p>Every failure arrives with everything you would have gone looking for.</p>,
    },
    bullets: [
      'Error and stack, with the source line highlighted',
      'Every step with its own timing',
      'Screenshots, video and the visual diff',
      'A signed link into the Playwright trace viewer',
    ],
    visual: screenshot,
  },
} satisfies Meta<typeof FeatureShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MediaRight: Story = {};

export const MediaLeft: Story = {
  args: { mediaSide: 'left', settings: { background: 'sunken' } },
};

/** A live view instead of a screenshot: it follows the theme and never goes stale. */
export const WithDemo: Story = {
  args: {
    header: { eyebrow: 'Run detail', heading: 'The whole run on one screen' },
    visual: (
      <BrowserFrame url="reports.example.com/acme/web/runs/481">
        <RunSummaryDemo />
      </BrowserFrame>
    ),
  },
};

/** No bullets and no link: the heading and the picture carry it alone. */
export const HeadingOnly: Story = {
  args: { bullets: [], header: { heading: 'The whole run on one screen' } },
};

export const WithLink: Story = {
  args: { link: { href: '/features', label: 'See every feature' } },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
