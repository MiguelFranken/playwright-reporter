import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Button } from './button';

const meta = {
  title: 'Primitives/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' },
  args: { onOpenChange: fn() },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const RowMenu = (args: React.ComponentProps<typeof DropdownMenu>) => {
  return (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Run actions" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {/* The label is a Menu.GroupLabel, so it has to live inside the group
            it names — Base UI throws otherwise. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Run 482</DropdownMenuLabel>
          <DropdownMenuItem>Open run</DropdownMenuItem>
          <DropdownMenuItem>Copy link</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete run</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const Default: Story = { render: RowMenu };

export const WithCheckboxes: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Columns</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>Duration</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>Branch</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>Executor</DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** Choosing an item runs its action and dismisses the menu. */
export const SelectsAnItem: Story = {
  render: RowMenu,
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /run actions/i }));

    const item = await body.findByRole('menuitem', { name: /open run/i });
    await userEvent.click(item);

    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument());
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, expect.anything());
  },
};

export const NavigatesWithKeyboard: Story = {
  render: RowMenu,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: /run actions/i });
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const menu = await within(document.body).findByRole('menu');
    await waitFor(() => expect(menu).toBeVisible());

    // Opening with the keyboard already highlights the first item, so the
    // arrow moves to the second.
    await expect(await within(document.body).findByRole('menuitem', { name: /open run/i })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(await within(document.body).findByRole('menuitem', { name: /copy link/i })).toHaveFocus();
  },
};
