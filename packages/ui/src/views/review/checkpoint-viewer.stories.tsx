import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { checkoutCompareTargets, diffStatesFlow, legacyFlow, libraryCompareFlows, longTextFlow, placeOrderFlow, reviewFlows, unavailableFlow } from '../../fixtures/review';
import { libraryFlows, NOW, toVerifyFlow, VIEWER_ID } from '../../fixtures/library-views';
import { resolveCompare, type CompareRule, type ReviewFlowView } from '../../lib/review';
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
    // The list animates out; a busy browser takes longer than the default second.
    await waitFor(() => expect(body.queryByRole('listbox')).not.toBeInTheDocument(), { timeout: 5000 });
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
 * Filling, one screen runs on under the bars: the header and the toolbar lie
 * over it, translucent and blurred, and the previews of the flow's checkpoints
 * float over its bottom-left corner. It opens with the page's top just below
 * the toolbar, and scrolls to its foot at the window's edge.
 */
export const FillRunsUnderTheBars: Story = {
  args: { initial: { checkpointId: changed.id, variant: 'desktop' }, frame: { preset: 'captured', width: 1280, height: 720, zoom: 'fit', fill: true } },
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await userEvent.click(body.getByRole('button', { name: 'Image' }));
    const screen = body.getByRole('region', { name: /desktop screen/ });
    const image = within(screen).getByRole('img');
    const header = body.getByRole('heading', { name: /Checkout filled in/ }).closest('header')!;
    const toolbar = body.getByRole('button', { name: /Fill/ }).closest('[class*="backdrop-blur"]')!;
    const strip = body.getByRole('list', { name: /^Checkpoints of/ }).closest('footer')!;
    for (const bar of [header, toolbar]) await expect(getComputedStyle(bar).backdropFilter).toContain('blur');
    // The strip of checkpoints has no bar: its previews float over the screen, in its bottom-left corner.
    await expect(getComputedStyle(strip).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    // Wide enough for the side panel, the bars lie over the screen.
    if (!window.matchMedia('(min-width: 64rem)').matches) return;
    await waitFor(() => expect(Math.abs(image.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1));
    await expect(screen.getBoundingClientRect().top).toBeLessThanOrEqual(header.getBoundingClientRect().top + 1);
    await waitFor(() => expect(screen.scrollHeight).toBeGreaterThan(screen.clientHeight));
    screen.scrollTop = screen.scrollHeight;
    await waitFor(() => expect(Math.abs(image.getBoundingClientRect().bottom - screen.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1));
  },
};

/**
 * The side panel folds away (the button in the header, or I) and gives the
 * screen the room; folded, the button still counts what is open in it. Beside
 * the stage it slides out and back in: leaving, it is out of reach at once and
 * gone once its column has closed over it.
 */
export const FoldTheSidePanel: Story = {
  args: { onPanelChange: fn() },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    const beside = window.matchMedia('(min-width: 64rem)').matches;
    const stage = body.getByLabelText('Checkpoint screens');
    const before = stage.clientWidth;
    await userEvent.click(body.getByRole('button', { name: 'Hide the side panel' }));
    if (beside) await expect(document.getElementById('checkpoint-panel')).not.toBeNull();
    await waitFor(() => expect(body.queryByRole('complementary', { name: 'Review' })).toBeNull());
    await waitFor(() => expect(document.getElementById('checkpoint-panel')).toBeNull());
    await expect(args.onPanelChange).toHaveBeenLastCalledWith({ open: false, width: 320 });
    if (beside) await waitFor(() => expect(stage.clientWidth).toBeGreaterThan(before));
    await userEvent.keyboard('i');
    await expect(await body.findByRole('complementary', { name: 'Review' })).toBeInTheDocument();
  },
};

/**
 * Its left edge drags (or, focused, the arrow keys move it) to make the panel
 * wider. A drag moves the panel on every frame without a render; the host
 * hears the width once the edge is let go, and keeps it.
 */
export const ResizeTheSidePanel: Story = {
  args: { onPanelChange: fn(), panel: { open: true, width: 400 } },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    if (!window.matchMedia('(min-width: 64rem)').matches) return;
    const panel = body.getByRole('complementary', { name: 'Review' });
    await waitFor(() => expect(Math.round(panel.getBoundingClientRect().width)).toBe(400));
    const edge = body.getByRole('separator', { name: 'Resize the side panel' });
    const rect = edge.getBoundingClientRect();
    const from = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    const to = { x: from.x - 80, y: from.y };
    // One pointer across both calls: the mouse stays pressed between them.
    const user = userEvent.setup();
    await user.pointer([
      { keys: '[MouseLeft>]', target: edge, coords: from },
      { target: edge, coords: to },
    ]);
    await expect(panel).toHaveStyle({ width: '480px' });
    await expect(args.onPanelChange).not.toHaveBeenCalled();
    await user.pointer({ keys: '[/MouseLeft]', target: edge, coords: to });
    await expect(args.onPanelChange).toHaveBeenLastCalledWith({ open: true, width: 480 });
    // The host here keeps its own width: let go, the panel goes back to it.
    await waitFor(() => expect(Math.round(panel.getBoundingClientRect().width)).toBe(400));
    edge.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(args.onPanelChange).toHaveBeenLastCalledWith({ open: true, width: 416 });
  },
};

/** What is looked up now and then — the step, the URL, the video and the trace — is behind Details (D). */
export const DetailsBehindAButton: Story = {
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.queryByText('Watch the video', { exact: false })).toBeNull();
    await userEvent.keyboard('d');
    const details = await body.findByRole('dialog', { name: 'Details' });
    await expect(within(details).getByRole('link', { name: /Watch the video/ })).toBeInTheDocument();
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

/**
 * The view holds from screen to screen until the reviewer changes it: opened
 * on an unchanged screen, the image stays on show where the next one changed;
 * comparing, a screen without changes is compared side by side.
 */
export const InTheLibraryKeepsTheView: Story = {
  args: { mode: 'library', initial: { checkpointId: placeOrderFlow.checkpoints[0].id, variant: 'desktop' } },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    await expect(body.getByRole('button', { name: 'Image' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(body.getByRole('button', { name: 'Next checkpoint' }));
    await waitFor(() => expect(args.onSelectionChange).toHaveBeenLastCalledWith({ checkpointId: changed.id, variant: 'desktop' }));
    await expect(body.getByRole('button', { name: 'Image' })).toHaveAttribute('aria-pressed', 'true');
    await expect(body.queryByRole('group', { name: 'Comparison' })).toBeNull();
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
    await expect(body.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(body.getByRole('button', { name: 'Previous checkpoint' }));
    await waitFor(() => expect(body.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true'));
    await expect(body.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
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
    const verify = await body.findByRole('region', { name: 'Verify comment 1' });
    await expect(body.getByText(/Commented on · run #483/)).toBeInTheDocument();
    await expect(within(verify).getByText(/The order button should use the primary style/)).toBeInTheDocument();
    await userEvent.click(within(verify).getByRole('button', { name: /Fixed — resolve/ }));
    await expect(args.comments!.onSetThreadStatus).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-verify', status: 'resolved' }));
    await expect(await body.findByText('Nothing left to verify')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Back to the screen' }));
    await waitFor(() => expect(body.queryByText('Nothing left to verify')).toBeNull());
    await expect(body.getByText('Ready to verify')).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Verify thread 1 against the version commented on' }));
    await expect(await body.findByRole('region', { name: 'Verify comment 1' })).toBeInTheDocument();
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
    // The strip of checkpoints floats over the screens: they run on to the stage's foot.
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
 * A host resolving the reviewer's "Compare with" rule the way the app does:
 * the open capture gets the chosen run as its `compare`, measured afresh.
 */
function ComparingHost({ flows, onRuleChange }: { flows: ReviewFlowView[]; onRuleChange: (next: CompareRule) => void }) {
  const [rule, setRule] = useState<CompareRule>('auto');
  const [selection, setSelection] = useState<ReviewSelection | null>({ checkpointId: changed.id, variant: 'desktop' });
  const open = changed.captures[0];
  const resolved = resolveCompare(open, rule, checkoutCompareTargets);
  const shown = resolved.target
    ? flows.map((f) => ({ ...f, checkpoints: f.checkpoints.map((cp) => ({ ...cp, captures: cp.captures.map((c) => (c.id === open.id ? { ...c, compare: resolved.target, diff: null } : c)) })) }))
    : flows;
  return (
    <CheckpointViewer
      flows={shown}
      selection={selection}
      onSelectionChange={setSelection}
      compareWith={{
        rule,
        onRuleChange: (next) => {
          setRule(next);
          onRuleChange(next);
        },
        targets: checkoutCompareTargets,
        now: NOW,
      }}
    />
  );
}

/** "Compare with" picks another run: side by side, its image is on the left, and a rule that finds nothing says so. */
export const CompareWithAnotherRun: StoryObj<typeof ComparingHost> = {
  render: (args) => <ComparingHost {...args} />,
  args: { flows: reviewFlows, onRuleChange: fn() },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole('dialog');
    const picker = body.getByRole('combobox', { name: 'Compare with' });
    await expect(picker).toHaveTextContent('vs. Approved (#470)');
    await userEvent.click(picker);
    await userEvent.click(await body.findByRole('option', { name: /Run #479/ }));
    await expect(args.onRuleChange).toHaveBeenLastCalledWith('run:479');
    await waitFor(() => expect(picker).toHaveTextContent('vs. Run #479'));
    await userEvent.click(body.getByRole('button', { name: 'Compare' }));
    await userEvent.click(await body.findByRole('button', { name: 'Side by side' }));
    await expect(await body.findByRole('img', { name: /Run #479/ })).toBeInTheDocument();
    // What to compare with is a choice of the comparison: the plain image does without it.
    await userEvent.click(body.getByRole('button', { name: 'Image' }));
    await expect(body.queryByRole('combobox', { name: 'Compare with' })).toBeNull();
  },
};
