import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { placeOrderFlow, unavailableFlow } from '../../fixtures/review';
import { ImageCompare } from './image-compare';

const changed = placeOrderFlow.checkpoints[1].captures[0];

const meta = {
  title: 'Views/Review/Viewer/ImageCompare',
  component: ImageCompare,
  args: { current: changed.image, reference: changed.baseline!.image, mode: 'side-by-side', referenceLabel: 'Approved (#470)', alt: 'Checkout filled in' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ImageCompare>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {};

export const Slider: Story = {
  args: { mode: 'slider' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const range = canvas.getByRole('slider', { name: 'Split position' });
    range.focus();
    await userEvent.keyboard('{Home}');
    await expect(range).toHaveAttribute('aria-valuenow', '0');
  },
};

/** Unchanged pixels go black; the recoloured button and badge light up. */
export const Difference: Story = { args: { mode: 'difference' } };

export const Overlay: Story = { args: { mode: 'onion' } };

/** A reference the retention policy deleted falls back to two columns. */
export const ReferenceMissing: Story = { args: { mode: 'slider', reference: unavailableFlow.checkpoints[0].captures[1].image } };
