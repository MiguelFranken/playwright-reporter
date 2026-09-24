import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { Button } from './button';

const VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
const SIZES = ['xs', 'sm', 'default', 'lg'] as const;
const ICON_SIZES = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const;

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Save changes', onClick: fn() },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'select', options: [...SIZES, ...ICON_SIZES] },
    disabled: { control: 'boolean' },
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const AllSizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {SIZES.map((size) => (
          <Button key={size} {...args} size={size}>
            {size}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {ICON_SIZES.map((size) => (
          <Button key={size} {...args} size={size} aria-label={`Add (${size})`}>
            <Plus />
          </Button>
        ))}
      </div>
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Mail /> Email the team
      </>
    ),
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: (
      <>
        <Trash2 /> Delete project
      </>
    ),
  },
};

export const Disabled: Story = { args: { disabled: true } };

/**
 * Base UI's `render` prop replaces the rendered element while keeping the
 * button's styling and behaviour — this is how a button becomes a link without
 * nesting an anchor inside a button.
 */
export const AsLink: Story = {
  args: { render: <a href="#runs" /> as never, children: 'View all runs' },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: /view all runs/i });
    await expect(link).toHaveAttribute('href', '#runs');
  },
};

export const Clicks: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: /save changes/i });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** A disabled button is inert to the pointer, not merely dimmed. */
export const DisabledSwallowsClicks: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: /save changes/i });
    // The button is inert by `pointer-events: none`, which userEvent refuses to
    // click through by default — waiving the check is what proves the click
    // reaches nothing rather than merely being untestable.
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
