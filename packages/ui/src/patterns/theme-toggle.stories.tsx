import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../components/dropdown-menu';
import { ThemeMenuItem, ThemeToggle } from './theme-toggle';

/**
 * The toggle reads next-themes, which the preview provides — but the preview
 * also pins the theme to the toolbar global, so clicking it here cannot flip
 * the catalogue. Use the toolbar to see both appearances; this story is about
 * the control itself.
 */
const meta = {
  title: 'Patterns/ThemeToggle',
  component: ThemeToggle,
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const IsLabelled: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /toggle theme/i })).toBeVisible();
  },
};

/** Inside a dropdown menu the toggle is a menu item, so the menu holds nothing but items. */
export const InAMenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="rounded-md border px-3 py-1.5 text-sm" />}>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <ThemeMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Account' }));
    const item = await within(document.body).findByRole('menuitem', { name: /Theme/ });
    await waitFor(() => expect(item).toBeVisible());
  },
};
