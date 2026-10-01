import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { diffStatesFlow, legacyFlow, libraryCompareFlows, longTextFlow, placeOrderFlow, reviewFlows, unavailableFlow } from '../../fixtures/review';
import { libraryFlows, NOW, toVerifyFlow, VIEWER_ID } from '../../fixtures/library-views';
import { CheckpointViewer, type ReviewSelection } from './checkpoint-viewer';

const changed = placeOrderFlow.checkpoints[1];

/** The viewer is controlled; this keeps the selection the way a host would. */
function Hosted(props: Omit<React.ComponentProps<typeof CheckpointViewer>, 'selection' | 'onSelectionChange'> & { initial: ReviewSelection; onSelectionChange?: (s: ReviewSelection | null) => void }) {
  const { initial, onSelectionChange, ...rest } = props;
  const [selection, setSelection] = useState<ReviewSelection | null>(initial);
  return (
    <CheckpointViewer
      {...rest}
      selection={selection}
      onSelectionChange={(s) => {
        setSelection(s);
        onSelectionChange?.(s);
      }}
    />
  );
}

const meta = {
  title: 'Views/Review/Viewer/CheckpointViewer',
  component: Hosted,
  args: { flows: reviewFlows, initial: { checkpointId: changed.id, variant: 'desktop' }, onDecide: fn(), onSelectionChange: fn(), onIgnoreRegionsChange: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A changed desktop image: the comparison modes appear because there is an approved baseline. */
export const Changed: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Difference' }));
    await expect(body.getByText(/Identical pixels are black/)).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Request changes' }));
    await expect(args.onDecide).toHaveBeenCalledWith({ captureIds: [changed.captures[0].id], decision: 'changes_requested' });
  },
};

/** Approving with the keyboard moves on to the next image that still needs review. */
export const ApproveWithKeyboard: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.keyboard('a');
    await expect(args.onDecide).toHaveBeenCalledWith({ captureIds: [changed.captures[0].id], decision: 'approved' });
    await waitFor(() => expect(args.onSelectionChange).toHaveBeenLastCalledWith({ checkpointId: placeOrderFlow.checkpoints[2].id, variant: 'desktop' }));
    await expect(document.activeElement).toHaveAccessibleName('Checkpoint screens');
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(args.onSelectionChange).toHaveBeenLastCalledWith({ checkpointId: changed.id, variant: 'desktop' }));
  },
};

/** Every variant side by side. */
export const AllVariants: Story = { args: { initial: { checkpointId: changed.id, variant: null } } };

/** The first capture of a checkpoint: nothing to compare with. */
export const NewCheckpoint: Story = { args: { initial: { checkpointId: placeOrderFlow.checkpoints[2].id, variant: 'mobile' } } };

export const ReadOnly: Story = { args: { canDecide: false } };

export const Saving: Story = { args: { pendingIds: [changed.captures[0].id] } };

export const LongText: Story = { args: { flows: [longTextFlow], initial: { checkpointId: longTextFlow.checkpoints[0].id, variant: 'desktop' } } };

export const ImagesUnavailable: Story = { args: { flows: [unavailableFlow], initial: { checkpointId: unavailableFlow.checkpoints[0].id, variant: null } } };

/** The screen bar: a legacy mobile capture shown on an iPhone-sized, scrolling screen at a fixed zoom. */
export const ScreenSettings: Story = {
  args: { flows: [legacyFlow], initial: { checkpointId: legacyFlow.checkpoints[0].id, variant: 'mobile' } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('spinbutton', { name: 'Screen width' })).toHaveValue(390);
    await userEvent.click(body.getByRole('combobox', { name: 'Zoom' }));
    await userEvent.click(await body.findByRole('option', { name: '50%' }));
    await expect(body.getByRole('combobox', { name: 'Zoom' })).toHaveTextContent('50%');
    await waitFor(() => expect(body.queryByRole('listbox')).not.toBeInTheDocument());
    await expect(body.getByRole('region', { name: /mobile screen/ })).toHaveStyle({ width: '195px' });
  },
};

/**
 * A zoom larger than the stage is wide is held at what fits the width, and a
 * screen longer than the stage ends at its bottom edge: the stage never
 * scrolls, the screen does.
 */
export const ZoomHeldAtTheWidth: Story = {
  args: { initial: { checkpointId: changed.id, variant: 'desktop' }, frame: { preset: 'desktop', width: 1280, height: 720, zoom: 1.5 } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Image' }));
    const stage = body.getByLabelText('Checkpoint screens');
    const screen = body.getByRole('region', { name: /desktop screen/ });
    await waitFor(() => expect(screen.getBoundingClientRect().width).toBeLessThanOrEqual(stage.clientWidth - 48));
    await expect(screen.getBoundingClientRect().bottom).toBeLessThanOrEqual(stage.getBoundingClientRect().bottom);
    await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth);
    await expect(stage.scrollHeight).toBeLessThanOrEqual(stage.clientHeight);
    await expect(body.getByRole('combobox', { name: 'Zoom' })).not.toHaveTextContent('150%');
  },
};

/**
 * A library screen is the newest run's capture: it compares with the approved
 * screen (else the capture before it) and is decided about as in that run's
 * review.
 */
export const InTheLibrary: Story = {
  args: { mode: 'library' },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('group', { name: 'Comparison' })).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Side by side' }));
    await expect(await body.findByText(/^Approved/, { selector: 'figcaption' })).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Approve' }));
    await expect(args.onDecide).toHaveBeenCalledWith(expect.objectContaining({ decision: 'approved' }));
  },
};

/** Who may not decide sees the comparison, not the decision. */
export const InTheLibraryReadOnly: Story = {
  args: { mode: 'library', canDecide: false },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('group', { name: 'Comparison' })).toBeInTheDocument();
    await expect(body.queryByRole('button', { name: /Approve/ })).toBeNull();
  },
};

/** An unchanged screen in the library says what it is identical to. */
export const InTheLibraryUnchanged: Story = {
  args: { mode: 'library', initial: { checkpointId: placeOrderFlow.checkpoints[0].id, variant: 'desktop' } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByText(/^Identical to /)).toBeInTheDocument();
  },
};

/**
 * A comment made on an earlier version, in the library: the thread offers to
 * verify it — the spot as commented on beside the screen now, and "Fixed"
 * resolves it; with nothing left, the walk says so.
 */
export const ComparesACommentWithItsVersion: Story = {
  args: {
    mode: 'library',
    flows: libraryFlows,
    initial: { checkpointId: toVerifyFlow.checkpoints[1].id, variant: 'desktop' },
    comments: { canComment: true, onCreateThread: fn(), onSetThreadStatus: fn(), onReply: fn(), now: NOW, viewerId: VIEWER_ID },
  },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByText('Ready to verify')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Verify thread 1 against the version commented on' }));
    const verify = await body.findByRole('group', { name: 'Verify comment 1' });
    await expect(within(verify).getByText(/Commented on · run #483/)).toBeInTheDocument();
    await expect(within(verify).getByText(/The order button should use the primary style/)).toBeInTheDocument();
    await userEvent.click(within(verify).getByRole('button', { name: /Fixed — resolve/ }));
    await expect(args.comments!.onSetThreadStatus).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-verify', status: 'resolved' }));
    await expect(await body.findByText('Nothing left to verify')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Back to the screen' }));
    await waitFor(() => expect(body.queryByText('Nothing left to verify')).toBeNull());
    await userEvent.click(body.getByRole('button', { name: 'Verify thread 1 against the version commented on' }));
    await expect(await body.findByRole('group', { name: 'Verify comment 1' })).toBeInTheDocument();
  },
};

/** A measured change opens on the changes: numbered regions, a pager, and N / P to step through them. */
export const MeasuredChanges: Story = {
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-pressed', 'true');
    await expect(body.getByText('2 changes')).toBeInTheDocument();
    await expect(body.getByText(/38,800 of 7,680,000 pixels differ/)).toBeInTheDocument();
    await userEvent.keyboard('n');
    await expect(body.getByText('Change 1 of 2')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Next change' }));
    await expect(body.getByText('Change 2 of 2')).toBeInTheDocument();
    await expect(body.getByRole('button', { name: 'Change 2' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Side by side, the two screens scroll together; the toggle (or L) lets them go apart. */
export const SideBySideScrollsTogether: Story = {
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Side by side' }));
    const [before, now] = await body.findAllByRole('region', { name: / — (Approved|This run)/ });
    const toggle = body.getByRole('button', { name: 'Scroll together' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    before.scrollTop = 200;
    await waitFor(() => expect(now.scrollTop).toBe(before.scrollTop));
    const kept = before.scrollTop;

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    now.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 100));
    await expect(before.scrollTop).toBe(kept);
  },
};

/** Leaving out an area: drawn in the viewer, saved through the host. */
export const LeaveOutAreas: Story = {
  args: { initial: { checkpointId: changed.id, variant: 'mobile' } },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByText(/1 area is left out of the comparison/)).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Leave out areas' }));
    await userEvent.click(await body.findByRole('button', { name: 'Remove area 1' }));
    await userEvent.click(body.getByRole('button', { name: 'Save and measure again' }));
    await expect(args.onIgnoreRegionsChange).toHaveBeenCalledWith({ captureId: changed.captures[1].id, regions: [] });
  },
};

/** Approved by the project's tolerance: the note says so, and why. */
export const AutoApproved: Story = {
  args: { flows: [diffStatesFlow], initial: { checkpointId: diffStatesFlow.checkpoints[0].id, variant: 'desktop' } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByText(/Approved automatically/)).toBeInTheDocument();
    await expect(body.getByText(/Within the project's diff tolerance/)).toBeInTheDocument();
  },
};

/** Content inserted near the top: the page grew, and the rest only moved. */
export const ContentMoved: Story = { args: { flows: [diffStatesFlow], initial: { checkpointId: diffStatesFlow.checkpoints[1].id, variant: 'desktop' } } };

/** Still measuring: the comparisons by eye work meanwhile. */
export const Measuring: Story = { args: { flows: [diffStatesFlow], initial: { checkpointId: diffStatesFlow.checkpoints[3].id, variant: 'desktop' } } };

/** The library comparing with another line of work: the comparisons come back, labelled with it, and nothing to decide. */
export const LibraryComparison: Story = {
  args: { flows: libraryCompareFlows, mode: 'library' },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Side by side' }));
    await expect(body.getByText('main')).toBeInTheDocument();
  },
};
