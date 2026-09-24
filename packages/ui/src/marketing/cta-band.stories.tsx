import type { Meta, StoryObj } from '@storybook/react';
import { githubCta, primaryCta } from '../fixtures/marketing';
import { CtaBand } from './cta-band';

const meta = {
  title: 'Marketing/CtaBand',
  component: CtaBand,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    heading: 'Point it at a Neon branch and run the demo.',
    text: <p>Five minutes, one database, no account to create.</p>,
    links: [primaryCta, githubCta],
  },
} satisfies Meta<typeof CtaBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Accent: Story = { args: { tone: 'accent' } };

export const HeadingOnly: Story = { args: { text: undefined, links: [] } };

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
