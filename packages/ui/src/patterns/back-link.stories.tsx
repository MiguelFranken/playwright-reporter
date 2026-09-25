import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { BackLink } from './back-link';

const meta = {
  title: 'Patterns/BackLink',
  component: BackLink,
  args: { href: '/teams/acme/projects/web/branches', children: 'Branches' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof BackLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Branches' })).toHaveAttribute('href', args.href);
  },
};

/** Above a detail page's header, where it always sits. */
export const AboveHeader: Story = {
  args: { href: '/teams/acme/projects/web/runs/482', children: 'Run #482' },
  render: (args) => (
    <div className="flex flex-col gap-3">
      <BackLink {...args} />
      <h1 className="text-title-l">checkout › pays with a saved card</h1>
    </div>
  ),
};
