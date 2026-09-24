import type { Meta, StoryObj } from '@storybook/react';
import { screenshotPair } from '../fixtures/marketing';
import { ThemedImage } from './themed-image';

const meta = {
  title: 'Marketing/ThemedImage',
  component: ThemedImage,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { sources: screenshotPair },
} satisfies Meta<typeof ThemedImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Toggle the theme in the toolbar: the other file is already in the document. */
export const Pair: Story = {};

/** One upload only — a diagram, say. It is used in both themes. */
export const LightOnly: Story = {
  args: { sources: { ...screenshotPair, dark: null } },
};
