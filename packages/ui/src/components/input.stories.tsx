import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Input } from './input';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: { placeholder: 'Search tests…', 'aria-label': 'Search tests', onChange: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, value: 'checkout' } };
export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'not an email' } };
export const Search: Story = { args: { type: 'search' } };

export const Typing: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('searchbox', { name: /search tests/i });
    await userEvent.type(input, 'guest cart');
    await expect(input).toHaveValue('guest cart');
  },
  args: { type: 'search' },
};

/** aria-invalid is what drives the error styling — not a class. */
export const InvalidIsAnnounced: Story = {
  args: { 'aria-invalid': true },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: /search tests/i });
    await expect(input).toBeInvalid();
  },
};
