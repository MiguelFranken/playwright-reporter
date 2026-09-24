import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { Button } from './button';

const meta = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

const Hint = (args: React.ComponentProps<typeof Tooltip>) => (
  <TooltipProvider>
    <Tooltip {...args}>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="About reliability" />}>
        <Info />
      </TooltipTrigger>
      <TooltipContent>Failures weigh fully, flakiness half.</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export const Default: Story = { render: Hint };

export const Sides: Story = {
  render: () => (
    <TooltipProvider>
      <div className="flex gap-4">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <Tooltip key={side}>
            <TooltipTrigger render={<Button variant="outline" size="sm" />}>{side}</TooltipTrigger>
            <TooltipContent side={side}>Anchored {side}.</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  ),
};

/** Hover opens it. The popup is portalled, so it is found on the body. */
export const OpensOnHover: Story = {
  render: Hint,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: /about reliability/i }));
    const tip = await within(document.body).findByText(/failures weigh fully/i);
    await waitFor(() => expect(tip).toBeVisible());
  },
};

/** …and so does keyboard focus, which is the accessibility half of the same feature. */
export const OpensOnFocus: Story = {
  render: Hint,
  play: async ({ canvasElement }) => {
    within(canvasElement).getByRole('button', { name: /about reliability/i }).focus();
    const tip = await within(document.body).findByText(/failures weigh fully/i);
    await waitFor(() => expect(tip).toBeVisible());
  },
};
