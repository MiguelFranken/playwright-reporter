import type { Meta, StoryObj } from '@storybook/react';
import { Section } from './section';
import { SectionHeader } from './section-header';

const meta = {
  title: 'Marketing/Section',
  component: Section,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    children: (
      <>
        <SectionHeader
          content={{
            eyebrow: 'Section',
            heading: 'One band of the page',
            intro: <p>Full-bleed background, 72rem column, one place to change the rhythm.</p>,
          }}
        />
        <div className="mt-8 h-32 rounded-xl border border-dashed border-border-strong" />
      </>
    ),
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sunken: Story = { args: { settings: { background: 'sunken' } } };

export const Accent: Story = { args: { settings: { background: 'accent' } } };

export const Compact: Story = { args: { settings: { spacing: 'compact' } } };

/** Bands alternate down the page; this is what the seam looks like. */
export const Stacked: Story = {
  render: (args) => (
    <>
      <Section {...args} />
      <Section {...args} settings={{ background: 'sunken' }} />
      <Section {...args} />
    </>
  ),
};
