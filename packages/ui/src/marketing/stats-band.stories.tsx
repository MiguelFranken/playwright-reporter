import type { Meta, StoryObj } from '@storybook/react';
import { StatsBand } from './stats-band';

const meta = {
  title: 'Marketing/StatsBand',
  component: StatsBand,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    header: { heading: 'Own the data' },
    items: [
      { value: 'Your Postgres', label: 'Database', hint: 'Neon, RDS or your own server' },
      { value: 'Your blob store', label: 'Artifacts', hint: 'Vercel Blob, or local disk' },
      { value: 'Your project', label: 'Hosting', hint: 'Vercel, or any Node host' },
      { value: 'MIT', label: 'Licence', hint: 'Fork it, run it, change it' },
    ],
  },
} satisfies Meta<typeof StatsBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TwoItems: Story = {
  args: { header: null, items: [{ value: '0 €', label: 'On free tiers' }, { value: '1 line', label: 'To set up' }] },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
