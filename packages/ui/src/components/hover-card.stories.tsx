import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';
import { Button } from './button';
import { Badge } from './badge';

const meta = {
  title: 'Primitives/HoverCard',
  component: HoverCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const CommitCard = (args: React.ComponentProps<typeof HoverCard>) => (
  <HoverCard {...args}>
    <HoverCardTrigger render={<Button variant="link" />}>9f2c8a4</HoverCardTrigger>
    <HoverCardContent className="w-80">
      <div className="flex flex-col gap-2">
        <p className="text-label-m">Keep the guest cart across sign-in</p>
        <p className="text-body-xs text-muted-foreground">Ada Lovelace committed 2 days ago</p>
        <Badge variant="outline">feature/checkout-guest-cart</Badge>
      </div>
    </HoverCardContent>
  </HoverCard>
);

export const Default: Story = { render: CommitCard };

export const OpensOnHover: Story = {
  render: CommitCard,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: '9f2c8a4' }));
    const card = await within(document.body).findByText(/keep the guest cart/i);
    await waitFor(() => expect(card).toBeVisible());
  },
};
