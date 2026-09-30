import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { fixedThread, movedAreaThread } from '../../fixtures/review-threads';
import { PinCloseUp } from './pin-close-up';

const origin = fixedThread.origin!;

const meta = {
  title: 'Views/Review/Comments/PinCloseUp',
  component: PinCloseUp,
  args: { image: origin.image, anchor: origin.anchor, number: 1, alt: 'Checkout — close-up of comment 1' },
  decorators: [(Story) => <div className="bg-surface p-6">{Story()}</div>],
} satisfies Meta<typeof PinCloseUp>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spot a pin points at, magnified, with the pin on it. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Checkout — close-up of comment 1' })).toBeInTheDocument();
  },
};

/** An area, with room around it. */
export const Area: Story = { args: { anchor: movedAreaThread.origin!.anchor, number: 3 } };

/** Where the pin landed on the screen now: dashed, since the screen changed since. */
export const Outdated: Story = { args: { anchor: fixedThread.anchor, state: 'outdated' } };

/** A pin in a corner: the close-up stays inside the image. */
export const AtTheEdge: Story = { args: { anchor: { kind: 'point', x: 0.99, y: 0.01 } } };

/** Small, as in a narrow window. */
export const Small: Story = { args: { width: 240, height: 150 } };

/** The image is gone. */
export const Unavailable: Story = {
  args: { image: { ...origin.image, available: false, unavailableReason: 'expired' } },
};
