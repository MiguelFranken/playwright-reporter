import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { placeOrderFlow, unavailableFlow } from '../../fixtures/review';
import { ImageCompare } from './image-compare';

const changed = placeOrderFlow.checkpoints[1].captures[0];

const meta = {
  title: 'Views/Review/Viewer/ImageCompare',
  component: ImageCompare,
  args: { current: changed.image, reference: changed.baseline!.image, mode: 'side-by-side', referenceLabel: 'Approved (#470)', alt: 'Checkout filled in' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ImageCompare>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {};

/** The split is the line itself: drag it (or anywhere on the images), or move its handle with the keys. */
export const Slider: Story = {
  args: { mode: 'slider' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = canvas.getByRole('slider', { name: 'Split position' });
    await expect(handle).toHaveAttribute('aria-valuenow', '50');
    // A keypress before the handle has focus goes nowhere: on a slow machine it would.
    handle.focus();
    await waitFor(() => expect(handle).toHaveFocus());
    await userEvent.keyboard('{Home}');
    await waitFor(() => expect(handle).toHaveAttribute('aria-valuenow', '0'));
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await waitFor(() => expect(handle).toHaveAttribute('aria-valuenow', '10'));

    // Dragging from a quarter of the way to three quarters leaves the split there.
    const surface = handle.closest<HTMLElement>('[data-slot="compare-surface"]')!;
    const r = surface.getBoundingClientRect();
    const y = r.top + r.height / 2;
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: { clientX: r.left + r.width * 0.25, clientY: y } },
      { target: surface, coords: { clientX: r.left + r.width * 0.75, clientY: y } },
      { keys: '[/MouseLeft]', target: surface },
    ]);
    await waitFor(() => expect(handle).toHaveAttribute('aria-valuenow', '75'));
    await expect(canvas.queryByRole('slider', { name: /opacity/i })).toBeNull();
  },
};

/** Unchanged pixels go black; the recoloured button and badge light up. */
export const Difference: Story = { args: { mode: 'difference' } };

export const Overlay: Story = { args: { mode: 'onion' } };

/** A reference the retention policy deleted falls back to two columns. */
export const ReferenceMissing: Story = { args: { mode: 'slider', reference: unavailableFlow.checkpoints[0].captures[1].image } };
