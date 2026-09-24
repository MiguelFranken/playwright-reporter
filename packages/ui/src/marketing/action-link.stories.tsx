import type { Meta, StoryObj } from '@storybook/react';
import { ActionLink, InlineLink } from './action-link';
import { linkAppearances } from '../lib/marketing';

const meta = {
  title: 'Marketing/ActionLink',
  component: ActionLink,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { link: { href: '/get-started', label: 'Get started', appearance: 'primary' } },
} satisfies Meta<typeof ActionLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Appearances: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {linkAppearances.map((appearance) => (
        <ActionLink key={appearance} link={{ href: '#', label: appearance, appearance }} />
      ))}
    </div>
  ),
};

/** External links say so, and open in a new tab with the right `rel`. */
export const External: Story = {
  args: {
    link: {
      href: 'https://github.com/mfranken/playwright-reporter',
      label: 'View on GitHub',
      appearance: 'secondary',
      external: true,
    },
  },
};

export const Inline: Story = {
  render: () => <InlineLink link={{ href: '/features', label: 'See every feature' }} />,
};
