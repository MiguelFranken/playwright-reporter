import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { ThemeToggle } from './theme-toggle';

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
