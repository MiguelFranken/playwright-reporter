import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { GitBranch } from 'lucide-react';
import { Badge } from './badge';

const VARIANTS = ['default', 'secondary', 'outline', 'destructive', 'ghost', 'link'] as const;

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  args: { children: 'main' },
  argTypes: { variant: { control: 'select', options: VARIANTS } },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {VARIANTS.map((variant) => (
        <Badge key={variant} {...args} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    variant: 'outline',
    children: (
      <>
        <GitBranch /> feature/checkout-guest-cart
      </>
    ),
  },
};

/** Badges are spans by default; `render` makes one a link without nesting. */
export const AsLink: Story = {
  args: { variant: 'outline', render: <a href="#branch" />, children: 'main' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'main' })).toHaveAttribute('href', '#branch');
  },
};

export const Overflow: Story = {
  render: (args) => (
    <div className="w-48">
      <Badge {...args} variant="outline">
        release/2026-09-18-hotfix-checkout-guest-cart
      </Badge>
    </div>
  ),
};
