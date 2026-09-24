import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import { Button } from './button';

const meta = {
  title: 'Primitives/Collapsible',
  component: Collapsible,
  args: { onOpenChange: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

const Attempt = (args: React.ComponentProps<typeof Collapsible>) => (
  <Collapsible {...args} className="max-w-md">
    <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
      <ChevronDown /> Attempt 2 — failed
    </CollapsibleTrigger>
    <CollapsibleContent>
      <pre className="mt-2 text-code-xs whitespace-pre-wrap text-muted-foreground">{`Error: expect(locator).toBeVisible() failed
  at tests/checkout.spec.ts:42:18`}</pre>
    </CollapsibleContent>
  </Collapsible>
);

export const Default: Story = { render: Attempt };
export const InitiallyOpen: Story = { render: Attempt, args: { defaultOpen: true } };

export const TogglesContent: Story = {
  render: Attempt,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /attempt 2/i });

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText(/toBeVisible\(\) failed/)).toBeVisible();
    await expect(args.onOpenChange).toHaveBeenCalled();
  },
};
