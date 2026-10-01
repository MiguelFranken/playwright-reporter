import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { diffStatesFlow, legacyFlow, libraryCompareFlows, longTextFlow, placeOrderFlow, reviewFlows, unavailableFlow, visualDiffFlow } from '../../fixtures/review';
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
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
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

/** Filling, the screen loses its frame and spans the stage edge to edge; F turns it back into a framed screen. */
export const FillTheStage: Story = {
  args: { initial: { checkpointId: changed.id, variant: 'desktop' }, frame: { preset: 'captured', width: 1280, height: 720, zoom: 'fit', fill: true } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Image' }));
    const stage = body.getByLabelText('Checkpoint screens');
    const screen = body.getByRole('region', { name: /desktop screen/ });
    await waitFor(() => expect(Math.abs(screen.getBoundingClientRect().width - stage.clientWidth)).toBeLessThanOrEqual(1));
    await expect(Math.abs(screen.getBoundingClientRect().height - stage.clientHeight)).toBeLessThanOrEqual(1);
    await expect(stage.scrollHeight).toBeLessThanOrEqual(stage.clientHeight);
    await expect(body.getByRole('button', { name: /Fill/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(body.getByRole('combobox', { name: 'Zoom' })).toBeDisabled();
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
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
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
 * A comment made on an earlier version, in the library: the screen opens on
 * it — the spot as commented on beside the screen now, without a click — and
 * "Fixed" resolves it; with nothing left, the walk says so. The thread offers
 * the comparison again from the screen.
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
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
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
    await userEvent.click(body.getByRole('button', { name: /Leave out areas/ }));
    await userEvent.click(await body.findByRole('button', { name: 'Remove area 1' }));
    await userEvent.click(body.getByRole('button', { name: 'Save and measure again' }));
    await expect(args.onIgnoreRegionsChange).toHaveBeenCalledWith({ captureId: changed.captures[1].id, rules: [], reason: null, expectedRevision: 2 });
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
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
    await userEvent.click(body.getByRole('button', { name: 'Side by side' }));
    await expect(body.getByText('main')).toBeInTheDocument();
  },
};

/**
 * The view first: the image, or how it changed. Comparing, the ways to compare
 * follow it; M switches between the two, Shift+M to the next way of comparing.
 */
export const ImageOrCompare: Story = {
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
    await expect(body.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(body.getByRole('button', { name: 'Slider' }));
    await userEvent.click(body.getByRole('button', { name: 'Image' }));
    await expect(body.queryByRole('group', { name: 'Comparison' })).toBeNull();
    // Compare goes back to the comparison last picked.
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
    await expect(body.getByRole('button', { name: 'Slider' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Shift>}m{/Shift}');
    await expect(body.getByRole('button', { name: 'Difference' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('m');
    await expect(body.getByRole('button', { name: 'Image' })).toHaveAttribute('aria-pressed', 'true');
    await expect(body.queryByRole('group', { name: 'Comparison' })).toBeNull();
  },
};

/** Every variant at once compares too: each screen with its own changes, beside its own reference, or over it. */
export const CompareAllVariants: Story = {
  args: { initial: { checkpointId: changed.id, variant: null } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-pressed', 'true');
    await expect(body.getByRole('region', { name: /, desktop, changes marked$/ })).toBeInTheDocument();
    await expect(body.getByRole('region', { name: /, mobile, changes marked$/ })).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Side by side' }));
    await expect(body.getAllByRole('region', { name: / — (desktop|mobile), (Approved|This run)/ })).toHaveLength(4);
    await userEvent.click(body.getByRole('button', { name: 'Difference' }));
    await expect(body.getAllByRole('region', { name: /, comparison$/ })).toHaveLength(2);
  },
};

/**
 * Every variant filling the stage: each screen under a caption bar ruled off
 * like the toolbar, the screens meeting at a hairline, as tall as the stage.
 */
export const FillAllVariants: Story = {
  args: { initial: { checkpointId: changed.id, variant: null }, frame: { preset: 'captured', width: 1280, height: 720, zoom: 'fit', fill: true } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Image' }));
    const stage = body.getByLabelText('Checkpoint screens');
    const desktop = body.getByRole('region', { name: /desktop screen/ });
    const mobile = body.getByRole('region', { name: /mobile screen/ });
    await waitFor(() => expect(Math.abs(mobile.getBoundingClientRect().left - desktop.getBoundingClientRect().right - 1)).toBeLessThanOrEqual(1));
    for (const screen of [desktop, mobile]) await expect(Math.abs(screen.getBoundingClientRect().bottom - stage.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);
    await expect(stage.scrollHeight).toBeLessThanOrEqual(stage.clientHeight);
    await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth);
    await expect(body.getByText('desktop', { selector: 'figcaption span' }).closest('figcaption')).toHaveStyle({ height: '32px' });
  },
};

/** Filling with every variant side by side: four screens, a hairline apart, each pair scrolling together. */
export const FillAllVariantsSideBySide: Story = {
  args: { initial: { checkpointId: changed.id, variant: null }, frame: { preset: 'captured', width: 1280, height: 720, zoom: 'fit', fill: true } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Side by side' }));
    const stage = body.getByLabelText('Checkpoint screens');
    await waitFor(() => expect(body.getAllByRole('region', { name: / — (desktop|mobile), / })).toHaveLength(4));
    await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth);
    await expect(stage.scrollHeight).toBeLessThanOrEqual(stage.clientHeight);
  },
};

/**
 * The regions of a measured change are listed as D1, D2… beside the image; picking one shows it, and the hand-off
 * menus name the comparison of the two captures — "Investigate" reads only, "Fix cause" may change code.
 */
export const RegionsAndAiHandoff: Story = {
  args: { flows: [visualDiffFlow], initial: { checkpointId: visualDiffFlow.checkpoints[0].id, variant: 'desktop' }, comments: { assistant: { setupHref: '#connect', project: 'acme/web' } } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    const list = body.getByRole('list', { name: 'Changed regions' });
    await userEvent.click(within(list).getByRole('button', { name: /D1/ }));
    await expect(within(list).getByRole('button', { name: /D1/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(body.getByText('Change 1 of 1')).toBeInTheDocument();
    await expect(body.getByRole('button', { name: 'Investigate with AI' })).toBeInTheDocument();
    await expect(body.getByRole('button', { name: 'Fix cause of D1 with AI' })).toBeInTheDocument();
  },
};

/** A screen with a rule: the changes can be shown with the rule applied or raw, and the editor lists the rule with its reason. */
export const RulesRawAndEffective: Story = {
  args: { initial: { checkpointId: changed.id, variant: 'mobile' }, onIgnorePreview: fn(), ignorePreview: { pending: false, result: { rawChangedPixels: 15_400, suppressedPixels: 9_600, remainingPixels: 5_800, remainingRegions: 1, ignoredAreaPercent: 2.8, sizeChanged: false } } },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByText(/1 area is left out of the comparison/)).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Raw' }));
    await expect(body.getByText('2 changes')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'With rules' }));
    await expect(body.getByText('1 change')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: /Leave out areas/ }));
    await expect(body.getByLabelText('Reason for area 1')).toHaveValue('The order time is live.');
    await waitFor(() => expect(args.onIgnorePreview).toHaveBeenCalled());
    await expect(body.getByText(/5,800 remaining/)).toBeInTheDocument();
  },
};
