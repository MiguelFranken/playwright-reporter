import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../components/button';
import { Badge } from '../components/badge';
import { PageHeader } from './page-header';

const meta = {
  title: 'Patterns/PageHeader',
  component: PageHeader,
  args: { title: 'Runs' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    title: 'Test explorer',
    description: 'Every test this project has ever reported, with its history and reliability score.',
  },
};

export const WithActions: Story = {
  args: {
    title: 'Run 482',
    description: 'feature/checkout-guest-cart · 9f2c8a4',
    children: (
      <>
        <Badge variant="outline">CI</Badge>
        <Button size="sm" variant="outline">
          Re-run failed
        </Button>
        <Button size="sm">Open trace</Button>
      </>
    ),
  },
};

/** The header stacks below `md` and sits side by side above it. */
export const Mobile: Story = {
  ...({ args: { title: 'Run 482', description: 'feature/checkout-guest-cart', children: <Button size="sm">Open trace</Button> } }),
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const LongTitle: Story = {
  args: {
    title: 'checkout keeps a guest cart across sign-in and restores the applied discount code',
    description: 'tests/integration/checkout/guest/keeps-cart-across-sign-in.spec.ts',
    children: <Button size="sm">Open trace</Button>,
  },
};
