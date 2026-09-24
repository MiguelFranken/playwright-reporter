import type { Meta, StoryObj } from '@storybook/react';
import { SectionHeader } from './section-header';

const meta = {
  title: 'Marketing/SectionHeader',
  component: SectionHeader,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    content: {
      eyebrow: 'Flakiness',
      heading: 'Find flaky tests before they find you',
      intro: <p>Detection within a run and across runs, a reliability score per test, and the chronic failures listed separately.</p>,
    },
  },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Centered: Story = {
  args: { content: { eyebrow: 'Flakiness', heading: 'Find flaky tests before they find you', align: 'center' } },
};

export const HeadingOnly: Story = { args: { content: { heading: 'Own the data' } } };

/** An empty header renders nothing at all, rather than a gap. */
export const Empty: Story = { args: { content: null } };
