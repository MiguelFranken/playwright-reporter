import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { checkoutDesktopDiff, diffStatesFlow, placeOrderFlow } from '../../fixtures/review';
import { DiffHighlight } from './diff-highlight';

const changed = placeOrderFlow.checkpoints[1].captures[0];

/** The active region is the host's; this keeps it the way the viewer does. */
function Hosted(props: Omit<React.ComponentProps<typeof DiffHighlight>, 'active' | 'onActiveChange'> & { onActiveChange?: (i: number) => void }) {
  const { onActiveChange, ...rest } = props;
  const [active, setActive] = useState<number | null>(null);
  return (
    <DiffHighlight
      {...rest}
      active={active}
      onActiveChange={(i) => {
        setActive(i);
        onActiveChange?.(i);
      }}
    />
  );
}

const meta = {
  title: 'Views/Review/Diff/DiffHighlight',
  component: Hosted,
  args: { image: changed.image, diff: checkoutDesktopDiff, frame: { width: 1280, height: 720 }, zoom: 0.5, alt: 'Checkout filled in', onActiveChange: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A full-page capture taller than the screen: the strip beside it shows where the changes are. */
export const LongPage: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const strip = canvas.getByRole('navigation', { name: 'Where the changes are' });
    await userEvent.click(within(strip).getByRole('button', { name: 'Change 2 of 2' }));
    await expect(args.onActiveChange).toHaveBeenCalledWith(1);
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Change 2' })).toHaveAttribute('aria-pressed', 'true'));
  },
};

/** Boxes only: the changed pixels themselves left unpainted. */
export const WithoutOverlay: Story = { args: { overlay: false } };

/** A banner inserted: the new area is one wide region, its band marked on the strip. */
export const ContentMoved: Story = { args: { image: diffStatesFlow.checkpoints[1].captures[0].image, diff: diffStatesFlow.checkpoints[1].captures[0].diff! } };

export const ImageUnavailable: Story = { args: { image: { url: '#expired', available: false, unavailableReason: 'expired' } } };
