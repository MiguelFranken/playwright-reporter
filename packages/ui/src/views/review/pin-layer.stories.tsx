import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { NOW, reviewThreads, VIEWER_ID } from '../../fixtures/review-threads';
import { placeOrderFlow } from '../../fixtures/review';
import { PinLayer, type ThreadDraft } from './pin-layer';
import { ScreenFrame } from './screen-frame';

const tall = placeOrderFlow.checkpoints[1].captures[0];

/** A screen at half size with its pins, holding the open thread and the draft the way the viewer does. */
function OnAScreen(props: Omit<React.ComponentProps<typeof PinLayer>, 'openThreadId' | 'onOpenThreadChange' | 'draft' | 'onDraftChange'>) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThreadDraft | null>(null);
  return (
    <ScreenFrame
      image={tall.image}
      frame={{ width: 1280, height: 720 }}
      zoom={0.5}
      alt="Checkout — desktop"
      overlay={() => <PinLayer {...props} openThreadId={open} onOpenThreadChange={setOpen} draft={draft} onDraftChange={setDraft} />}
    />
  );
}

const meta = {
  title: 'Views/Review/Comments/PinLayer',
  component: OnAScreen,
  args: { captureId: tall.id, threads: reviewThreads, label: 'Checkout, desktop', now: NOW, viewerId: VIEWER_ID, canComment: true, onCreateThread: fn(), onReply: fn(), onSetThreadStatus: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OnAScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open pins (resolved ones hidden), an area, an outdated pin, and a count of the pins below the frame. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: /^Thread 4/ })).toBeNull();
    await waitFor(() => expect(canvas.getByRole('button', { name: /more below/ })).toBeVisible());
  },
};

export const WithResolved: Story = { args: { showResolved: true } };

/** Comment mode: a click drops a draft pin with its composer. */
export const Commenting: Story = {
  args: { commenting: true },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('application'));
    const body = within(document.body);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'Bigger{Enter}');
    await expect(args.onCreateThread).toHaveBeenCalledWith(expect.objectContaining({ captureId: tall.id, body: 'Bigger' }));
  },
};

export const Hidden: Story = {
  args: { hidden: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('button', { name: /^Thread/ })).toHaveLength(0);
  },
};
