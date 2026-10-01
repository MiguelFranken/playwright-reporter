import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { commentedCheckpointId, commentedFlows, flowWithThreads, NOW, uncommentedRequestFlows, uncommentedRequestHereFlows, verifyFlows, VIEWER_ID } from '../../fixtures/review-threads';
import { CheckpointViewer, type ReviewSelection } from './checkpoint-viewer';

const desktopCapture = commentedFlows[0].checkpoints[1].captures.find((c) => c.variant === 'desktop')!;

/** The viewer is controlled; this keeps the selection the way a host would. */
function Hosted(props: Omit<React.ComponentProps<typeof CheckpointViewer>, 'selection' | 'onSelectionChange'> & { initial: ReviewSelection }) {
  const { initial, ...rest } = props;
  const [selection, setSelection] = useState<ReviewSelection | null>(initial);
  return <CheckpointViewer {...rest} selection={selection} onSelectionChange={setSelection} />;
}

const comments = {
  canComment: true,
  viewerId: VIEWER_ID,
  now: NOW,
  onCreateThread: fn(),
  onReply: fn(),
  onSetThreadStatus: fn(),
  onEditComment: fn(),
  onDeleteComment: fn(),
  onOpenThreadChange: fn(),
};

const meta = {
  title: 'Views/Review/Comments/InTheViewer',
  component: Hosted,
  args: { flows: commentedFlows, initial: { checkpointId: commentedCheckpointId, variant: 'desktop' }, onDecide: fn(), comments },
  parameters: { layout: 'fullscreen' },
  // The callbacks are shared by every story here: each starts with none recorded.
  beforeEach: () => {
    for (const f of Object.values(comments)) if (typeof f === 'function' && 'mockClear' in f) f.mockClear();
  },
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The checkpoint has a comment made on an earlier version, and the viewer
 * opens on it; these stories are about the screen, so they go back to it.
 */
async function onTheScreen() {
  const body = within(document.body);
  await body.findByRole('dialog');
  await userEvent.click(await body.findByRole('button', { name: 'Stop verifying' }));
  await waitFor(() => expect(body.queryByRole('group', { name: /^Verify comment/ })).toBeNull());
}

/** Numbered pins on the screenshot, and every thread in the list beside it. */
export const Default: Story = {
  play: async () => {
    const body = within(document.body);
    await onTheScreen();
    const stage = within(body.getByRole('region', { name: 'Checkpoint image' }));
    await expect(stage.getByRole('button', { name: /^Thread 1: Ada Lovelace/ })).toBeInTheDocument();
    await expect(body.getByRole('radio', { name: 'Open, 5' })).toBeChecked();
  },
};

/** A comment made on an earlier version is what the viewer opens on, without a click; Escape shows the screen. */
export const OpensOnTheCommentToVerify: Story = {
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(await body.findByRole('group', { name: 'Verify comment 3' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('group', { name: 'Verify comment 3' })).toBeNull());
    await expect(body.getByRole('complementary', { name: 'Checkpoint details' })).toBeInTheDocument();
    await userEvent.keyboard('o');
    await expect(await body.findByRole('group', { name: 'Verify comment 3' })).toBeInTheDocument();
  },
};

/** C, a click on the screenshot, a comment and Enter: a new thread where the click was. */
export const PinAComment: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    await onTheScreen();
    await userEvent.keyboard('c');
    const surface = await body.findByRole('application', { name: /Place a comment on/ });
    await userEvent.click(surface);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'Make the headline bolder{Enter}');
    await expect(args.comments!.onCreateThread).toHaveBeenCalledWith(
      expect.objectContaining({ captureId: desktopCapture.id, body: 'Make the headline bolder', anchor: expect.objectContaining({ kind: 'point' }) }),
    );
  },
};

/** From the keyboard: Enter puts a crosshair in the middle, arrows move it, Enter drops the pin. */
export const PinWithTheKeyboard: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    await onTheScreen();
    await userEvent.click(body.getByRole('button', { name: 'Comment' }));
    const surface = await body.findByRole('application', { name: /Place a comment on/ });
    surface.focus();
    // One key at a time: each step renders before the next reads it.
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(surface.querySelector('[data-slot="pin-crosshair"]')).not.toBeNull());
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    await userEvent.keyboard('{Enter}');
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'Here{Enter}');
    const [input] = (args.comments!.onCreateThread as ReturnType<typeof fn>).mock.lastCall!;
    await expect(input.anchor.x).toBeCloseTo(0.51);
  },
};

/** Hovering a pin shows its thread. */
export const HoverAPin: Story = {
  play: async () => {
    const body = within(document.body);
    await onTheScreen();
    await userEvent.hover(within(body.getByRole('region', { name: 'Checkpoint image' })).getByRole('button', { name: /^Thread 1: / }));
    await waitFor(() => expect(body.getByRole('textbox', { name: 'Reply to thread 1' })).toBeVisible());
  },
};

/** A row in the list opens its pin's thread; E resolves it. */
export const OpenFromTheList: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    await onTheScreen();
    const list = within(body.getByRole('region', { name: /Comments/ }));
    await userEvent.click(list.getByRole('button', { name: /^Thread 2: / }));
    await waitFor(() => expect(body.getByRole('region', { name: 'Thread 2' })).toBeVisible());
    await expect(args.comments!.onOpenThreadChange).toHaveBeenCalledWith(2);
    await userEvent.keyboard('e');
    await expect(args.comments!.onSetThreadStatus).toHaveBeenCalledWith({ threadId: 'thread-2', status: 'resolved', captureId: desktopCapture.id });
  },
};

/** Approving an image with open threads asks whether to resolve them. */
export const ApproveWithOpenThreads: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.keyboard('a');
    await expect(args.onDecide).not.toHaveBeenCalled();
    await userEvent.click(await body.findByRole('button', { name: 'Resolve and approve' }));
    await expect(args.onDecide).toHaveBeenCalledWith({ captureIds: [desktopCapture.id], decision: 'approved', resolveThreads: true });
  },
};

/** A link to thread 6 opens it at its pin, far down the page. */
export const LinkedThread: Story = {
  args: { comments: { ...comments, openThread: 6 } },
  play: async () => {
    const body = within(document.body);
    await waitFor(() => expect(body.getByRole('region', { name: 'Thread 6' })).toBeVisible());
  },
};

/** A viewer who may not comment reads the threads. */
export const ReadOnly: Story = {
  args: { canDecide: false, comments: { now: NOW } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('radio', { name: 'Open, 5' })).toBeChecked();
    await expect(body.queryByRole('button', { name: 'Comment' })).toBeNull();
  },
};

/** No threads yet. */
export const NoComments: Story = {
  args: { flows: [flowWithThreads([])] },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByText(/No comments yet/)).toBeInTheDocument();
  },
};

/**
 * Side by side, a comment made on the approved screen is drawn on the left,
 * where it was placed; the right shows where it lands now, as a marker.
 */
export const OnTheImageItWasMadeOn: Story = {
  args: { flows: verifyFlows },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
    await userEvent.click(body.getByRole('button', { name: 'Side by side' }));
    const left = within(await body.findByRole('region', { name: /— Approved \(#470\)$/ }));
    await expect(left.getByRole('button', { name: /^Thread 1: / })).toBeInTheDocument();
    const right = within(body.getByRole('region', { name: /— This run$/ }));
    await expect(right.queryByRole('button', { name: /^Thread 1: / })).toBeNull();
    await expect(right.getByRole('button', { name: /^Thread 2: / })).toBeInTheDocument();
    await expect(body.getByText('2 comments made here')).toBeInTheDocument();
  },
};

/** The comments made before the screen changed, one by one: E resolves one and shows the next, until none is left. */
export const VerifyTheFixes: Story = {
  args: { flows: verifyFlows },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    const list = within(body.getByRole('region', { name: /Comments/ }));
    await expect(list.getByText('2 comments to verify')).toBeInTheDocument();
    await expect(list.getByRole('list', { name: 'To verify' })).toBeInTheDocument();
    await expect(list.getByRole('list', { name: 'Waiting for a fix' })).toBeInTheDocument();
    await userEvent.click(list.getByRole('button', { name: 'Verify' }));
    await expect(await body.findByText('Verify comment 1')).toBeInTheDocument();
    await userEvent.keyboard('e');
    await expect(args.comments!.onSetThreadStatus).toHaveBeenCalledWith({ threadId: 'thread-fixed', status: 'resolved', captureId: desktopCapture.id });
    await expect(await body.findByText('Verify comment 3')).toBeInTheDocument();
    await userEvent.keyboard('e');
    await expect(await body.findByText('Nothing left to verify')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Back to the screen' }));
    await waitFor(() => expect(body.queryByText('Nothing left to verify')).toBeNull());
  },
};

/** The open comments go to an AI assistant as a prompt that names the image and the comments. */
export const FixWithAi: Story = {
  args: { flows: verifyFlows, comments: { ...comments, assistant: { setupHref: '#connect', project: 'acme/web' } } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    const list = within(body.getByRole('region', { name: /Comments/ }));
    await userEvent.click(list.getByRole('button', { name: 'Fix with AI' }));
    const item = await body.findByRole('menuitem', { name: 'Copy prompt' });
    await waitFor(() => expect(item).toBeVisible());
  },
};

/** Changes were asked for without a comment on the approved screen, and this run changed it: compare with the version asked about. */
export const UncommentedRequestChangedSince: Story = {
  args: { flows: uncommentedRequestFlows },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('note')).toHaveTextContent(/asked for changes to an earlier version of this screen, without a comment/);
    await userEvent.click(body.getByRole('button', { name: 'Compare with the version asked about' }));
    await expect(body.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Changes asked for on these pixels without saying what: pin what should change. */
export const UncommentedRequestOnThisImage: Story = {
  args: { flows: uncommentedRequestHereFlows },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('note')).toHaveTextContent(/asked for changes to this image without saying what/);
    await userEvent.click(body.getByRole('button', { name: 'Pin what should change' }));
    await expect(await body.findByRole('application', { name: /Place a comment on/ })).toBeInTheDocument();
  },
};
