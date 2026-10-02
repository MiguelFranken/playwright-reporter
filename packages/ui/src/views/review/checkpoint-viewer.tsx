'use client';

import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, History, Link2, Link2Off, MessageSquareWarning, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSyncedScroll } from '../../hooks/use-synced-scroll';
import { Button } from '../../components/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../components/dialog';
import { Kbd } from '../../components/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/tooltip';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { ReviewStatusBadge, ReviewStatusDot } from '../../patterns/review-status-badge';
import { StatusIcon } from '../../patterns/status-badge';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import {
  captureViewport,
  checkpointLabel,
  COMPARE_RULE_LABELS,
  compareRuleRun,
  compareVariants,
  DEFAULT_FRAME,
  frameFor,
  fillFrames,
  shownZoom,
  type FrameSettings,
  DEFAULT_REVIEW_PANEL,
  REVIEW_PANEL,
  reviewPanel,
  type ReviewPanelSettings,
  type FrameSize,
  NEEDS_REVIEW,
  resolveCompare,
  type ReviewCaptureView,
  type ReviewCheckpointView,
  type ReviewDecisionInput,
  type ReviewDiffView,
  type ReviewFlowView,
  type ReviewImage,
  type StoryboardMode,
} from '../../lib/review';
import { fixCommentsPrompt } from '../../lib/ai-handoff';
import { openingComment, openThreadCount, sortThreads, threadStage, type ReviewThreadView, type ThreadActions, type ThreadFilter } from '../../lib/review-threads';
import { DebugWithAiMenu } from '../../patterns/debug-with-ai-menu';
import { DiffHighlight, diffImageSize } from './diff-highlight';
import { AnalysisPanel } from './analysis-panel';
import { comparisonIdOf, DiffRegionList, VisualDiffAiActions } from './diff-regions';
import { DiffSummary } from './diff-summary';
import { COMPARE_MODE_LABELS, COMPARE_MODES, ImageCompare, type CompareMode } from './image-compare';
import { CompareTargetPicker, type CompareWithProps } from './compare-target-picker';
import { IgnoreRegionsEditor, type IgnoreRect, type IgnoreRulesChange } from './ignore-regions-editor';
import { regionId, type AiMode, type AnalysisView, type IgnorePreviewView, type MaskPolicy, type Rect } from '../../lib/visual-diff';
import { FrameToolbar } from './frame-toolbar';
import { PinLayer, type PinFocusRequest, type ThreadDraft } from './pin-layer';
import { CommentBar } from './markup-toolbar';
import { CheckpointDetails } from './checkpoint-details';
import { PanelResizer } from './panel-resizer';
import { COMMENT_TOOLS, DEFAULT_MARKUP_COLOR, type CommentTool, type MarkupColor, type MarkupShape } from '../../lib/review-markup';
import type { ImageSize } from '../../lib/review-threads';
import { liveHeight, liveWidth, MOVING_ATTR, SCREEN_ROOM_VAR, SCREEN_ZOOM_VAR, ScreenFrame } from './screen-frame';
import { FeedbackThreadCard, OriginMarker, VerifyDone } from './thread-verify';
import { FeedbackRequestCard, ResolveDone } from './resolve-feedback';
import { FeedbackPanel, type FeedbackEntry } from './feedback-panel';
import { feedbackItemDone, type FeedbackItem, type FeedbackScope } from '../../lib/feedback-queue';
import { ThreadList } from './thread-list';
import { LibraryStateChip } from '../../patterns/library-state-chip';
import { captureStates, type LibraryState } from '../../lib/library-views';

/** How long the panel takes to open or close, in ms; the panel stays mounted while it leaves. */
const PANEL_MOTION_MS = 220;
/** Its timing: the design system's emphasised ease-out, as `animate-rise-in` has. */
const PANEL_MOTION = 'duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)]';

/** What the viewer shows: a checkpoint, and one of its variants or (`null`) all of them side by side. */
export interface ReviewSelection {
  checkpointId: string;
  variant: string | null;
}

/** Comment threads in the viewer: who may do what, and what the host records. */
/** A step undo can take back: shapes drawn on a capture, or drawings erased from it. */
type DrawingStep = { kind: 'draw' | 'erase'; captureId: string; imageSize: ImageSize | null; drawings: { id: string; shape: MarkupShape }[] };
/** How many steps undo keeps. */
const MAX_UNDO = 50;
/** An id for a drawing, chosen here so it can be erased before the page has caught up with it. */
const newId = () => crypto.randomUUID();

export interface ReviewCommentsProps extends ThreadActions {
  canComment?: boolean;
  /** May delete anybody's comment. */
  canModerate?: boolean;
  /** The signed-in user, whose own comments can be edited and deleted. */
  viewerId?: string | null;
  /** The reference instant for relative times (stories pin it). */
  now?: Date;
  /** The thread to open when the viewer shows the checkpoint, by number: a link (`thread=3`). */
  openThread?: number | null;
  /** A thread was opened by a click, or closed: the host may put its number in the URL. */
  onOpenThreadChange?: (number: number | null) => void;
  /**
   * Hands comments to the user's AI assistant ("Fix with AI"): the page that
   * explains connecting one, and the project the prompt names.
   */
  assistant?: { setupHref: string; project?: string | null } | null;
}

/**
 * Going through open feedback one item after another, across screens and
 * flows (the library's "Resolve feedback"): the items in order, which of them,
 * and how the host shows an item that is on another screen.
 */
export interface ResolveFeedbackProps {
  /** The feedback to go through, in order; kept while it is resolved, so the count holds still. */
  items: readonly FeedbackItem[];
  scope: FeedbackScope;
  /** Open items per scope, as the flows are now. */
  counts: Record<FeedbackScope, number>;
  /** Another scope — or the same one, to go through what is still open again. */
  onScopeChange: (next: FeedbackScope) => void;
  /** Show an item on another screen: its checkpoint and variant, and its thread. */
  onGo: (item: FeedbackItem) => void;
}

/** A comparison: `changes`, this run's image with the measured changes marked, or the two images put together. */
type CompareStage = 'changes' | CompareMode;
/** What the stage shows: the image, a comparison, or (`ignore`) the areas left out being drawn. */
type StageMode = 'image' | 'ignore' | CompareStage;

/** The height of a screen's caption bar when the screens fill the stage. */
const PANE_BAR = 32;

interface Position {
  flow: ReviewFlowView;
  checkpoint: ReviewCheckpointView;
  flowIndex: number;
  index: number;
}

/** Every checkpoint of the flows, in storyboard order. */
function positions(flows: readonly ReviewFlowView[]): Position[] {
  const out: Position[] = [];
  flows.forEach((flow, flowIndex) => flow.checkpoints.forEach((checkpoint, index) => out.push({ flow, checkpoint, flowIndex, index })));
  return out;
}

function sortedCaptures(cp: ReviewCheckpointView) {
  return [...cp.captures].sort((a, b) => compareVariants(a.variant, b.variant));
}


/**
 * The reference a capture is compared with: another line of work's capture
 * when the library compares two, else the approved baseline, else the capture
 * before it — in the library as in a run's review, since a library screen is
 * the newest run's capture and is decided about like one.
 */
function referenceOf(capture: ReviewCaptureView): { captureId: string; image: ReviewImage; label: string; same: boolean } | null {
  if (capture.compare) return { captureId: capture.compare.captureId, image: capture.compare.image, label: capture.compare.label, same: capture.compare.same };
  if (capture.baseline)
    return { captureId: capture.baseline.captureId, image: capture.baseline.image, label: `Approved${capture.baseline.runNumber ? ` (#${capture.baseline.runNumber})` : ''}`, same: capture.baseline.same };
  if (capture.previous) return { captureId: capture.previous.captureId, image: capture.previous.image, label: `Run #${capture.previous.runNumber}`, same: capture.previous.same };
  return null;
}

/** The AI analysis of the open capture against its reference, as the host offers it. */
export interface ViewerAnalysisProps {
  allowed: boolean;
  reason?: string | null;
  mode?: AiMode | null;
  analyses: readonly AnalysisView[];
  pending?: boolean;
  decidingId?: string | null;
  onAnalyze?: (input: { captureId: string; baseCaptureId: string }) => void;
  onDecide?: (input: { suggestionId: string; decision: 'accepted' | 'rejected'; rects?: Rect[]; captureId: string }) => void;
}

/** A screen on show with what it is compared with, and whether measured changes can be marked on it. */
interface Compared {
  capture: ReviewCaptureView;
  reference: ReturnType<typeof referenceOf>;
  diff: ReviewDiffView | null;
  size: { width: number; height: number } | null;
  changes: boolean;
}

/** The raw measurement (before the rules left areas out), when it exists and found something. */
const rawOf = (diff: ReviewDiffView | null) => (diff?.raw && diff.raw.state === 'done' && diff.raw.changedPixels > 0 ? diff.raw : null);

function comparisonOf(capture: ReviewCaptureView): Compared {
  const reference = referenceOf(capture);
  const diff = reference ? (capture.diff ?? null) : null;
  const size = diff ? diffImageSize(capture.image, diff) : null;
  // With the rules applied nothing may remain; the raw changes can still be shown.
  return { capture, reference, diff, size, changes: Boolean(capture.image.available && diff?.state === 'done' && (diff.changedPixels > 0 || diff.sizeChanged || rawOf(diff)) && size) };
}

/** The diff as the chosen policy shows it: effective, or the raw measurement's numbers and regions. */
function diffUnder(diff: ReviewDiffView, policy: MaskPolicy): ReviewDiffView {
  const raw = policy === 'raw' ? rawOf(diff) : null;
  return raw ? { ...diff, changedPixels: raw.changedPixels, ratio: raw.ratio, regions: raw.regions, overlayUrl: raw.overlayUrl ?? null } : diff;
}

/** The threads of a capture placed on `referenceId` (the image shown beside it), drawn there where they were placed. */
function onReference(threads: readonly ReviewThreadView[], referenceId: string | undefined) {
  const here: ReviewThreadView[] = [];
  const rest: ReviewThreadView[] = [];
  for (const t of threads) (referenceId && t.origin?.captureId === referenceId ? here : rest).push(t);
  return { here: here.map((t) => ({ ...t, anchor: t.origin!.anchor })), ghosts: here, rest };
}

/** How many checkpoints either side of the open one have their images fetched ahead. */
const PRELOAD_AROUND = 2;

/**
 * The images of the checkpoints next to the open one, and what they compare
 * against, fetched while the reviewer looks at this one: the arrow keys and
 * the step after an approval show the next screen at once.
 */
function usePreloadNeighbours(all: readonly Position[], at: number) {
  const urls = useMemo(() => {
    if (at < 0) return [];
    const out = new Set<string>();
    for (let i = Math.max(0, at - PRELOAD_AROUND); i <= Math.min(all.length - 1, at + PRELOAD_AROUND); i++) {
      if (i === at) continue;
      for (const c of all[i].checkpoint.captures) {
        if (c.image.available) out.add(c.image.url);
        const reference = referenceOf(c);
        if (reference?.image.available && !reference.same) out.add(reference.image.url);
      }
    }
    return [...out];
  }, [all, at]);
  useEffect(() => {
    // The browser keeps what these fetch in its cache; the timer lets the open screen's own images go first.
    const timer = setTimeout(() => {
      for (const url of urls) {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [urls]);
}

/**
 * The full-screen review of one checkpoint at a time: its image at full
 * resolution (or every variant side by side), a comparison with the approved
 * baseline, what was captured where and when, and the decision.
 *
 * Built for going through a run with the keyboard: ← → move between
 * checkpoints, ↑ ↓ between flows, V switches the variant, M between the image
 * and its comparison (Shift+M the way of comparing),
 * N and P step through the measured changes, A approves and moves on to the
 * next image that needs review, C pins comments on the screenshot. Controlled: the host owns the selection (it may live in the URL)
 * and records decisions.
 *
 * A screen with comments made on an earlier version opens on the first of
 * them, compared with the screen as it is now: verifying needs no click.
 * With `resolve`, the viewer goes through feedback instead of screens — every
 * item opens that way, `[` `]` step through all of them, and resolving one
 * moves on to the next, on whichever screen it is.
 */
export function CheckpointViewer({
  flows,
  selection,
  onSelectionChange,
  onDecide,
  pendingIds = [],
  canDecide = true,
  frame: frameProp,
  onFrameChange,
  mode = 'review',
  onIgnoreRegionsChange,
  ignorePendingId,
  onIgnorePreview,
  ignorePreview,
  analysis,
  comments = {},
  resolve,
  panel: panelProp,
  onPanelChange,
  compareWith,
}: {
  flows: readonly ReviewFlowView[];
  selection: ReviewSelection | null;
  onSelectionChange: (next: ReviewSelection | null) => void;
  onDecide?: (input: ReviewDecisionInput) => void;
  /** Captures whose decision is being saved. */
  pendingIds?: readonly string[];
  canDecide?: boolean;
  /** The screen captures are shown on; uncontrolled when absent. */
  frame?: FrameSettings;
  onFrameChange?: (next: FrameSettings) => void;
  /** `library`: the screens as documentation — where each stands in the review loop instead of a run's statuses; decisions only with `canDecide` and `onDecide`. */
  mode?: StoryboardMode;
  /** Saves the areas a capture's checkpoint and variant leave out of comparisons; without it they cannot be edited. */
  onIgnoreRegionsChange?: (input: IgnoreRulesChange) => void;
  /** Measures what rectangles drawn in the editor would leave out of the open capture's comparison. */
  onIgnorePreview?: (input: { captureId: string; regions: IgnoreRect[] }) => void;
  /** The answer to the last `onIgnorePreview`. */
  ignorePreview?: { pending: boolean; result: IgnorePreviewView | null; error?: string | null } | null;
  /** The AI analysis of the open capture against its reference, when the host offers one. */
  analysis?: ViewerAnalysisProps | null;
  /** The capture whose ignored areas are being saved. */
  ignorePendingId?: string | null;
  comments?: ReviewCommentsProps;
  /** Going through open feedback, item by item; absent to go through screens. */
  resolve?: ResolveFeedbackProps | null;
  /** The side panel, shown or folded and how wide; uncontrolled when absent. */
  panel?: ReviewPanelSettings | null;
  onPanelChange?: (next: ReviewPanelSettings) => void;
  /**
   * What the open image is compared with, chosen by the reviewer. The host
   * resolves the rule into the capture's `compare` (and its measurement), so
   * the viewer shows it like any other reference.
   */
  compareWith?: CompareWithProps;
}) {
  const library = mode === 'library';
  const resolving = resolve ?? null;
  const all = useMemo(() => positions(flows), [flows]);
  const at = selection ? all.findIndex((p) => p.checkpoint.id === selection.checkpointId || p.checkpoint.aliases?.includes(selection.checkpointId)) : -1;
  const pos = at >= 0 ? all[at] : null;
  usePreloadNeighbours(all, at);
  // Unset until the first screen is shown: it opens on its changes, or on the image when it has none, and keeps that view.
  const [stage, setStage] = useState<StageMode | null>(null);
  // The comparison last picked: "Compare" goes back to it.
  const [compareMode, setCompareMode] = useState<CompareStage>('changes');
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  // With rules applied, the raw measurement (before they left areas out) can be shown instead of the effective one.
  const [maskPolicy, setMaskPolicy] = useState<MaskPolicy>('effective');
  // Rectangles a suggestion handed to the editor, drawn in before the person adjusts them.
  const [prefill, setPrefill] = useState<Rect[] | null>(null);
  // Every variant at once, each screen's own selected change.
  const [activeOf, setActiveOf] = useState<Readonly<Record<string, number>>>({});
  const [commenting, setCommenting] = useState(false);
  // What a click or drag does in comment mode, and the colour drawings are in: kept from one checkpoint to the next.
  const [tool, setTool] = useState<CommentTool>('pin');
  const [color, setColor] = useState<MarkupColor>(DEFAULT_MARKUP_COLOR);
  const [draft, setDraft] = useState<ThreadDraft | null>(null);
  // What was drawn and erased on this screen, newest last: undo takes it back.
  const [drawHistory, setDrawHistory] = useState<DrawingStep[]>([]);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('open');
  const [composing, setComposing] = useState(false);
  const [pinsHidden, setPinsHidden] = useState(false);
  // Side by side, the two screens scroll together unless the reviewer unlinks them.
  const [syncScroll, setSyncScroll] = useState(true);
  const [focus, setFocus] = useState<PinFocusRequest | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [ownPanel, setOwnPanel] = useState<ReviewPanelSettings>(DEFAULT_REVIEW_PANEL);
  const panel = panelProp ? reviewPanel(panelProp) : ownPanel;
  // Shown or folded, the panel moves in and out over `PANEL_MOTION_MS`: it stays mounted while it leaves.
  const panelMounted = usePresence(panel.open, PANEL_MOTION_MS);
  // The panel's width is laid out in three places: the grid's second column, the panel itself (which keeps it while the
  // column moves) and where the strip of checkpoints stops. Dragging the edge writes it to those three elements directly:
  // a move that set state would render this whole viewer once per frame, and the stage, resized by it, once more. (Not
  // through a CSS variable: a custom property changing on the grid invalidates the style of everything inside it.)
  const gridRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const panelColumns = (width: number | null) => `minmax(0,1fr) ${width ?? 0}px`;
  const laidOut = useRef('');
  const layoutPanel = (open: boolean, width: number) => {
    const key = `${open}:${width}`;
    if (laidOut.current === key) return;
    laidOut.current = key;
    if (gridRef.current) gridRef.current.style.gridTemplateColumns = panelColumns(open ? width : null);
    if (asideRef.current) asideRef.current.style.width = `${width}px`;
    if (stripRef.current) stripRef.current.style.right = `${open ? width : 0}px`;
  };
  /** The width while the edge is dragged: on the DOM on every move, and the host's once it is let go. */
  const movePanel = (width: number) => layoutPanel(true, width);
  /** While the edge is dragged the layout follows the pointer, not its opening motion; the stage knows from the first move. */
  const resizing = useRef(false);
  const setResizing = (on: boolean) => {
    resizing.current = on;
    for (const el of [gridRef.current, asideRef.current, stripRef.current]) if (el) el.style.transition = on ? 'none' : '';
    if (on && stageRef.current) stageRef.current.setAttribute(MOVING_ATTR, '');
  };
  // Let go, the layout shows the host's width — the one it kept, or the one it had — whatever the drag left in the DOM.
  useLayoutEffect(() => {
    if (overlaid && !resizing.current) layoutPanel(panel.open, panel.width);
  });
  const setPanel = (next: Partial<ReviewPanelSettings>) => {
    const value = { ...panel, ...next };
    setOwnPanel(value);
    onPanelChange?.(value);
  };
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Going through feedback happens in the side panel: it opens with the round.
  useEffect(() => {
    if (resolve && !panel.open) setPanel({ open: true });
    // Only when a round starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(resolve)]);
  // Walking through the comments made on an earlier version: whether, which one, and how many were resolved on the way.
  const [verifying, setVerifying] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verified, setVerified] = useState<ReadonlySet<string>>(() => new Set());
  // Resolving feedback: the item on show, the ones dealt with here (before the host catches up), and whether the end was reached.
  const [itemKey, setItemKey] = useState<string | null>(null);
  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set());
  const [finished, setFinished] = useState(false);
  const approveRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // The dialog mounts its content in a portal after opening; state follows the element itself.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const [toolbarEl, setToolbarEl] = useState<HTMLDivElement | null>(null);
  const [stripEl, setStripEl] = useState<HTMLElement | null>(null);

  const captures = pos ? sortedCaptures(pos.checkpoint) : [];
  const variant = selection?.variant ?? null;
  const shown = variant ? captures.filter((c) => c.variant === variant) : captures;
  const current = shown.length === 1 ? shown[0] : null;
  // Every screen on show with what it is compared with: one variant, or all of them side by side.
  const compared = shown.map(comparisonOf);
  const multi = compared.length > 1;
  const canCompare = compared.some((x) => x.reference);
  const anyChanges = compared.some((x) => x.changes);
  const reference = current ? compared[0].reference : null;
  const diff = current ? compared[0].diff : null;
  const deciding = Boolean(canDecide && onDecide);
  const onScreen = (it: FeedbackItem) => Boolean(pos && (it.checkpointId === pos.checkpoint.id || pos.checkpoint.aliases?.includes(it.checkpointId)) && (!variant || it.variant === variant));
  const hereItems = resolving ? resolving.items.filter(onScreen) : [];
  // The end: every item gone through, or none in the scope.
  const ended = Boolean(resolving && (finished || resolving.items.length === 0));
  const item = resolving && !ended ? (hereItems.find((i) => i.key === itemKey) ?? hereItems.find((i) => i.number != null && i.number === comments.openThread) ?? hereItems[0] ?? null) : null;
  const itemIndex = item && resolving ? resolving.items.indexOf(item) : -1;
  const isDone = (it: FeedbackItem, done: ReadonlySet<string> = handled) => done.has(it.key) || feedbackItemDone(it, flows);
  const doneCount = resolving ? resolving.items.filter((i) => isDone(i)).length : 0;
  const measuredSize = current ? compared[0].size : null;
  const hasChanges = Boolean(current && compared[0].changes);
  // The reviewer's rule found nothing for this image: say so beside the default shown instead.
  const compareFallback = (() => {
    if (!current || !compareWith || !resolveCompare(current, compareWith.rule, compareWith.targets).fellBack) return null;
    const run = compareRuleRun(compareWith.rule);
    if (run) return `Run #${run} did not capture this screen.`;
    if (compareWith.rule === 'comments') return 'No earlier image of this screen has open comments.';
    return `No ${COMPARE_RULE_LABELS[compareWith.rule as 'baseline' | 'previous'].toLowerCase()} for this image.`;
  })();
  const rawAvailable = Boolean(diff && rawOf(diff));
  const shownDiff = diff ? diffUnder(diff, maskPolicy) : null;
  const regions = hasChanges && shownDiff ? shownDiff.regions : [];
  const ownSize = current?.image.width && current.image.height ? { width: current.image.width, height: current.image.height } : null;
  const canIgnore = Boolean(onIgnoreRegionsChange && canDecide && !current?.compare && current?.image.available && (measuredSize ?? ownSize));
  // The view picked holds from screen to screen: one without measured changes is compared side by side rather than
  // dropped to the plain image, so moving on (or picking another image to compare with) never flips Image and Compare.
  // Only the reviewer changes it.
  const effectiveStage: StageMode =
    stage === null
      ? anyChanges
        ? 'changes'
        : 'image'
      : stage === 'ignore'
      ? canIgnore
        ? 'ignore'
        : 'image'
      : stage === 'changes'
        ? anyChanges
          ? 'changes'
          : canCompare
            ? 'side-by-side'
            : 'image'
        : canCompare && stage !== 'image'
          ? stage
          : 'image';
  const comparing = effectiveStage !== 'image' && effectiveStage !== 'ignore';
  // What "Compare" opens: the comparison last picked, or side by side where nothing was measured to mark.
  const compareStage: CompareStage = compareMode === 'changes' && !anyChanges ? 'side-by-side' : compareMode;
  const compareModes: CompareStage[] = [...(anyChanges ? (['changes'] as const) : []), ...COMPARE_MODES];
  // The view the viewer opened on is kept once a screen is shown.
  useEffect(() => {
    if (stage === null && shown.length > 0) setStage(effectiveStage);
  }, [stage, shown.length, effectiveStage]);
  const showStage = (next: StageMode) => {
    setStage(next);
    if (next !== 'image' && next !== 'ignore') setCompareMode(next);
  };
  const [ownFrame, setOwnFrame] = useState<FrameSettings>(DEFAULT_FRAME);
  const frameSettings = frameProp ?? ownFrame;
  const setFrame = (next: FrameSettings) => {
    setOwnFrame(next);
    onFrameChange?.(next);
  };
  // Read once it rests: the screens follow the stage by CSS (see `zoomCss`), the numbers here label and bound things.
  // While it moves the stage carries `MOVING_ATTR`, and the screens' images are scaled on the GPU rather than laid out.
  const stageSize = useElementSize(stageEl);
  // Narrower than the side panel needs, the viewer scrolls as one page: the stage grows with its screens, so fitting them
  // follows the window's height rather than the stage's own.
  const stackedHeight = useStackedHeight();
  // Beside the side panel, the header, the toolbar and the strip of checkpoints lie over the stage, translucent and
  // blurred, so what scrolls runs on under them. `inset` is how much of the stage they cover: the screens start below the
  // bars above and stop above the strip, the way they did when the bars stood beside them.
  const headerHeight = useOuterHeight(headerEl);
  const toolbarHeight = useOuterHeight(toolbarEl);
  const stripHeight = useOuterHeight(stripEl);
  const overlaid = stackedHeight == null;
  // The strip of checkpoints floats over the screens' bottom-left corner, so the screens run on to the window's edge.
  const inset = overlaid ? { top: headerHeight + toolbarHeight, bottom: 0 } : { top: 0, bottom: 0 };
  const canComment = Boolean(comments.canComment && comments.onCreateThread);
  const threadGroups = shown.map((c) => ({ captureId: c.id, variant: c.variant, threads: c.threads ?? [] }));
  const shownThreads = threadGroups.flatMap((g) => g.threads);
  // The comments to verify: open ones placed on an earlier version (and the one on show, once resolved).
  const verifyQueue = sortThreads(shownThreads.filter((t) => threadStage(t) === 'verify' || (t.id === verifyingId && t.placement === 'outdated')));
  // What is left to walk through: open and not resolved here yet, and the one on show.
  const toWalk = verifyQueue.filter((t) => (t.status === 'open' && !verified.has(t.id)) || t.id === verifyingId);
  const resolveThread = item?.kind === 'thread' ? (shownThreads.find((t) => t.id === item.threadId) ?? null) : null;
  const comparedThread = resolving ? (verifying ? resolveThread : null) : verifying && verifyingId ? (verifyQueue.find((t) => t.id === verifyingId) ?? null) : null;
  // A change request nobody commented on, while resolving: the image asked about beside the screen now.
  // The item's capture whether the stage compares it or shows the screen; the stage compares it only while verifying.
  const itemRequestCapture = resolving && item?.kind === 'request' ? (shown.find((c) => c.id === item.captureId) ?? null) : null;
  const itemRequest = itemRequestCapture
    ? (itemRequestCapture.request ?? { by: itemRequestCapture.decision?.by ?? null, at: itemRequestCapture.decision?.at ?? '', runNumber: itemRequestCapture.decision?.runNumber ?? null, captureId: itemRequestCapture.id, onThisImage: true })
    : null;
  const requestCapture = verifying ? itemRequestCapture : null;
  const requestShown = requestCapture ? itemRequest : null;
  const requestReference = requestCapture ? referenceOf(requestCapture) : null;
  const requestThen = requestShown && !requestShown.onThisImage && requestReference && requestReference.captureId === requestShown.captureId ? requestReference.image : null;
  const comparedCapture = comparedThread ? (shown.find((c) => c.threads?.some((t) => t.id === comparedThread.id)) ?? null) : null;
  const threadComparing = Boolean(comparedThread && comparedCapture);
  // The thread in the side panel while feedback is gone through: the item's (whether or not the stage compares it), or the one verified.
  const cardThread = resolving ? resolveThread : comparedThread;
  const cardCapture = cardThread ? (shown.find((c) => c.threads?.some((t) => t.id === cardThread.id)) ?? null) : null;
  // Comparing a comment with the version it was made on, or a change request with the image asked about: two screens.
  const comparesTwo = threadComparing ? comparedThread!.placement === 'outdated' : Boolean(requestShown && !requestShown.onThisImage);
  // The frames on the stage, per screen on show: side by side, each beside its reference.
  const paneFrames = (threadComparing ? [comparedCapture!] : requestCapture ? [requestCapture] : effectiveStage === 'ignore' && current ? [current] : shown).map((c) => {
    const f = frameFor(frameSettings, c);
    if (threadComparing || requestCapture) return comparesTwo ? [f, f] : [f];
    return effectiveStage === 'side-by-side' && referenceOf(c) ? [f, f] : [f];
  });
  const frames = paneFrames.flat();
  const fill = Boolean(frameSettings.fill);
  // One plain screen needs no caption over it when it fills the stage: the toolbar already says what it is.
  const captionless = effectiveStage === 'image' && !threadComparing && !requestCapture && shown.length === 1;
  const zoomFrames = frames;
  // Filling, the screens meet at a hairline; framed, they stand apart.
  const gap = fill ? 1 : 24;
  // A screen's caption: a bar across its top when the screens fill the stage, a line above its frame otherwise.
  const caption = fill ? PANE_BAR : 28;
  // What sits around the screens inside the stage: captions above them (leaving areas out, the help and the list below),
  // the comparison's controls, the changes' minimap beside them. Feedback being verified has only captions: what it
  // says is in the side panel.
  const verifyingPanes = threadComparing || Boolean(requestCapture);
  const around = verifyingPanes
    ? { above: caption, beside: 0 }
    : effectiveStage === 'ignore'
        ? { above: 180, beside: 0 }
        : effectiveStage === 'changes'
          ? { above: multi ? caption : 0, beside: 20 * compared.filter((x) => x.changes).length }
          : effectiveStage === 'onion' || effectiveStage === 'difference'
            ? { above: 40 + (multi ? caption : 0), beside: 0 }
            : (effectiveStage === 'slider' && !multi) || (fill && captionless)
              ? { above: 0, beside: 0 }
              : { above: caption, beside: 0 };
  // The room the screens have: the stage less its padding (none when they fill it). They never outgrow it, so the stage
  // itself never scrolls.
  const padding = fill ? 0 : 48;
  const room = {
    width: stageSize.width - padding - around.beside,
    height: (stackedHeight == null ? stageSize.height - padding - inset.top - inset.bottom : Math.max(240, stackedHeight * 0.75)) - around.above,
  };
  // The largest zoom the width allows; the toolbar offers nothing above it.
  const maxZoom = shownZoom(Infinity, zoomFrames, room, gap);
  const filled = fill ? fillFrames(frames, room, gap) : null;
  const zoom = filled?.zoom ?? shownZoom(frameSettings.zoom, zoomFrames, room, gap);
  // One screen filling the stage runs under the bars: as tall as the whole stage, the room they cover kept clear inside
  // it (see `bleed` on the stage), so it opens exactly where it did and its page scrolls on under them.
  const bleed = fill && captionless && overlaid && !verifying && !(resolving && ended) && (inset.top > 0 || inset.bottom > 0);
  // The screens are sized by CSS from the stage's size (container query units), so they follow its edge being dragged,
  // the panel opening and closing and the window being resized on every frame, laid out by the browser alone: no
  // render, no image asked for again — and the images themselves are not laid out at all, only scaled on the GPU (see
  // `MOVING_ATTR`). The stage sets `SCREEN_ZOOM_VAR` — `zoom` above, as CSS computes it (`tan(atan2(a, b))` is the
  // number a/b) — and `SCREEN_ROOM_VAR`, the height a screen may fill. The container is the section around the stage,
  // whose box is the stage's but never changes with the mode: a container's units resolve against its content box,
  // and a browser may not resolve them again when only the padding changed (filling the stage takes its padding away),
  // so the padding and the bars the stage keeps clear are taken off here instead. Screens filling the stage and
  // feedback being verified are as tall as the room (a long page is read by scrolling it); any other screen longer
  // than the room ends at its edge and scrolls inside. Stacked, the viewer scrolls as a page: the room follows the
  // window's height.
  const roomCss = overlaid ? `calc(100cqh - ${(bleed ? 0 : padding + inset.top + inset.bottom) + around.above}px)` : `calc(max(240px, 75vh) - ${around.above}px)`;
  const widthFit = `tan(atan2(calc(100cqw - ${padding + around.beside + gap * Math.max(0, frames.length - 1)}px), ${Math.max(1, frames.reduce((sum, f) => sum + f.width, 0))}px))`;
  const heightFit = `tan(atan2(var(${SCREEN_ROOM_VAR}), ${Math.max(1, ...frames.map((f) => f.height))}px))`;
  const zoomCss = fill ? `max(0.1, ${widthFit})` : frameSettings.zoom === 'fit' ? `max(0.1, min(1, ${widthFit}, ${heightFit}))` : `max(0.1, min(${frameSettings.zoom}, ${widthFit}))`;
  const tall = fill || verifyingPanes;
  const pending = new Set(pendingIds);
  const busy = shown.some((c) => pending.has(c.id));

  const openCount = openThreadCount(shownThreads);
  // Pins sit on images drawn at the capture's own geometry: the plain image, its changes, and this run's side of a side-by-side.
  const pinsOn = threadComparing || effectiveStage === 'image' || effectiveStage === 'changes' || effectiveStage === 'side-by-side';
  const listed = sortThreads(shownThreads.filter((t) => threadFilter === 'all' || t.status === threadFilter || t.id === openThreadId));

  // A new checkpoint starts at its first change, without a half-placed pin or an open thread; comment mode stays on.
  const selectionKey = `${selection?.checkpointId}\u0000${selection?.variant}`;
  useEffect(() => {
    setActiveRegion(null);
    setActiveOf({});
    setMaskPolicy('effective');
    setDraft(null);
    setDrawHistory([]);
    setComposing(false);
    setConfirmApprove(false);
    setOpenThreadId(null);
    setVerifying(false);
    setVerifyingId(null);
    setVerified(new Set());
    setFinished(false);
    // Comments made on an earlier version are what to look at first: the screen opens on them, unless a link names another thread.
    if (resolving) return;
    const linkedThread = comments.openThread != null ? shownThreads.find((t) => t.number === comments.openThread) : null;
    const start = linkedThread ? (threadStage(linkedThread) === 'verify' ? linkedThread : null) : (verifyQueue.find((t) => t.status === 'open') ?? null);
    if (start) {
      setVerifying(true);
      setVerifyingId(start.id);
      setOpenThreadId(start.id);
    }
    // Only when another screen is shown, not on every revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // Resolving feedback, each item opens compared with what it was given on.
  useEffect(() => {
    if (!resolving || !item) return;
    showItem(item);
    // Only when another item is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key, selectionKey]);

  // A link to a thread (`thread=3`) opens it and brings its pin into view, once its checkpoint is shown.
  // Every variant numbers its threads from 1: the number a click put in the link is the open thread's own, so that one
  // stays open — the first screen's thread of the same number is another.
  const linked =
    comments.openThread != null ? (shownThreads.find((t) => t.id === openThreadId && t.number === comments.openThread) ?? shownThreads.find((t) => t.number === comments.openThread) ?? null) : null;
  useEffect(() => {
    if (!linked || linked.id === openThreadId) return;
    setOpenThreadId(linked.id);
    if (linked.status === 'resolved') setThreadFilter((f) => (f === 'open' ? 'all' : f));
    setFocus((f) => ({ threadId: linked.id, nonce: (f?.nonce ?? 0) + 1, ping: true }));
    // Only when the link or the checkpoint changes, not on every revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked?.id, selectionKey]);

  const openThread = (id: string | null, opts: { focus?: boolean } = {}) => {
    setOpenThreadId(id);
    if (id) setDraft(null);
    if (opts.focus && id) setFocus((f) => ({ threadId: id, nonce: (f?.nonce ?? 0) + 1, ping: true }));
    comments.onOpenThreadChange?.(id ? (shownThreads.find((t) => t.id === id)?.number ?? null) : null);
  };
  /** The item on show while resolving: its comparison, its thread open. */
  const showItem = (it: FeedbackItem) => {
    setVerifying(true);
    setVerifyingId(it.threadId);
    setCommenting(false);
    setDraft(null);
    setPinsHidden(false);
    if (it.threadId) setOpenThreadId(it.threadId);
  };
  /** Shows an item, on this screen or (through the host) another. */
  const go = (it: FeedbackItem) => {
    setFinished(false);
    setItemKey(it.key);
    if (onScreen(it)) showItem(it);
    else resolving?.onGo(it);
  };
  const stepItem = (delta: 1 | -1) => {
    if (!resolving) return;
    const items = resolving.items;
    if (finished) {
      if (delta < 0 && items.length) go(items[items.length - 1]);
      return;
    }
    const next = items[(itemIndex >= 0 ? itemIndex : delta > 0 ? -1 : items.length) + delta];
    if (next) go(next);
    else if (delta > 0) setFinished(true);
  };
  /** After `from` was dealt with: the next item still open, wrapping round once; the end when none is. */
  const goOnFrom = (from: FeedbackItem | null, done: ReadonlySet<string>) => {
    if (!resolving) return;
    const items = resolving.items;
    const i = from ? items.indexOf(from) : -1;
    const open = (it: FeedbackItem) => !isDone(it, done);
    const next = items.slice(i + 1).find(open) ?? items.slice(0, Math.max(0, i)).find(open);
    if (next) go(next);
    else setFinished(true);
  };
  /** Another scope, or the same one from the start: the host pins the items again. */
  const changeScope = (next: FeedbackScope) => {
    setFinished(false);
    setHandled(new Set());
    setItemKey(null);
    setVerifying(true);
    resolving?.onScopeChange(next);
  };

  /** Walks through the comments to verify, from `id` or the first; `null` stops. */
  const verify = (id?: string | null) => {
    if (id === null) {
      setVerifying(false);
      setVerifyingId(null);
      return;
    }
    const asItem = resolving && id ? resolving.items.find((i) => i.threadId === id) : null;
    if (asItem) return go(asItem);
    const start = id ? verifyQueue.find((t) => t.id === id) : verifyQueue.find((t) => t.status === 'open' && !verified.has(t.id));
    setVerifying(true);
    setVerifyingId(start?.id ?? null);
    setCommenting(false);
    setDraft(null);
    setPinsHidden(false);
    if (start) openThread(start.id);
  };
  const stepVerify = (delta: number) => {
    if (!toWalk.length) return;
    const i = toWalk.findIndex((t) => t.id === verifyingId);
    const next = toWalk[(i + delta + toWalk.length) % toWalk.length];
    setVerifyingId(next.id);
    openThread(next.id);
  };
  /** The comment on show was fixed: resolve it and go on to the next one still open. */
  const resolveVerified = () => {
    if (!cardThread || !cardCapture || cardThread.status !== 'open') return;
    comments.onSetThreadStatus?.({ threadId: cardThread.id, status: 'resolved', captureId: cardCapture.id });
    if (resolving) {
      const done = item ? new Set(handled).add(item.key) : handled;
      setHandled(done);
      goOnFrom(item, done);
      return;
    }
    const done = new Set(verified).add(cardThread.id);
    setVerified(done);
    // Resolved here, whether or not the host has caught up.
    const rest = verifyQueue.filter((t) => t.status === 'open' && !done.has(t.id));
    const i = verifyQueue.findIndex((t) => t.id === cardThread.id);
    const next = rest.find((t) => verifyQueue.indexOf(t) > i) ?? rest[0] ?? null;
    setVerifyingId(next?.id ?? null);
    if (next) openThread(next.id);
    else openThread(null);
  };
  const stepThread = (delta: number) => {
    if (!listed.length) return;
    const i = listed.findIndex((t) => t.id === openThreadId);
    const next = listed[(i + delta + listed.length) % listed.length] ?? listed[0];
    if (next.anchor.kind !== 'image' && !pinsOn) showStage('image');
    openThread(next.id, { focus: true });
  };
  /** Saves a shape drawn on a capture, and remembers it for undo. */
  const draw = (captureId: string, shape: MarkupShape, imageSize: ImageSize | null) => {
    if (!comments.onCreateDrawings) return;
    const step: DrawingStep = { kind: 'draw', captureId, imageSize, drawings: [{ id: newId(), shape }] };
    comments.onCreateDrawings({ captureId, drawings: step.drawings, imageSize });
    setDrawHistory((h) => [...h.slice(-(MAX_UNDO - 1)), step]);
  };
  /** Erases drawings, and remembers them for undo. */
  const erase = (captureId: string, gone: readonly { id: string; tool: MarkupShape['tool']; color: MarkupShape['color']; points: number[] }[], imageSize: ImageSize | null) => {
    if (!comments.onDeleteDrawings || !gone.length) return;
    comments.onDeleteDrawings({ drawingIds: gone.map((d) => d.id) });
    const step: DrawingStep = { kind: 'erase', captureId, imageSize, drawings: gone.map((d) => ({ id: d.id, shape: { tool: d.tool, color: d.color, points: d.points } })) };
    setDrawHistory((h) => [...h.slice(-(MAX_UNDO - 1)), step]);
  };
  /** Takes back the last shape drawn (erases it) or the last erasing (draws them again). */
  const undoDrawing = () => {
    const step = drawHistory.at(-1);
    if (!step) return;
    setDrawHistory((h) => h.slice(0, -1));
    if (step.kind === 'draw') comments.onDeleteDrawings?.({ drawingIds: step.drawings.map((d) => d.id) });
    else comments.onCreateDrawings?.({ captureId: step.captureId, imageSize: step.imageSize, drawings: step.drawings.map((d) => ({ id: newId(), shape: d.shape })) });
  };
  const toggleCommenting = (next = !commenting) => {
    setCommenting(next);
    if (!next) setDraft(null);
    else {
      // Pins go on the image as it was captured: the changes view, the plain image, or this run's side.
      if (!pinsOn) showStage('image');
      setPinsHidden(false);
    }
  };
  const moveRegion = (delta: number) => {
    if (regions.length === 0) return;
    if (effectiveStage !== 'changes') showStage('changes');
    setActiveRegion((i) => (i == null ? (delta > 0 ? 0 : regions.length - 1) : (i + delta + regions.length) % regions.length));
  };

  const select = (p: Position | undefined, keepVariant = true) => {
    if (!p) return;
    const variants = p.checkpoint.captures.map((c) => c.variant);
    onSelectionChange({ checkpointId: p.checkpoint.id, variant: keepVariant && variant && variants.includes(variant) ? variant : variant ? (sortedCaptures(p.checkpoint)[0]?.variant ?? null) : null });
  };
  const move = (delta: number) => select(all[at + delta]);
  const moveFlow = (delta: number) => {
    if (!pos) return;
    const target = all.find((p) => p.flowIndex === pos.flowIndex + delta);
    select(target);
  };
  const cycleVariant = () => {
    if (!pos) return;
    const names = [...captures.map((c) => c.variant), null];
    const next = names[(names.indexOf(variant) + 1) % names.length];
    onSelectionChange({ checkpointId: pos.checkpoint.id, variant: next });
  };
  /** The image, or the comparison; `next`, the comparison after the one on show. */
  const cycleStage = (next = false) => {
    if (!canCompare) return;
    setVerifying(false);
    if (!next) showStage(comparing ? 'image' : compareStage);
    else showStage(compareModes[(compareModes.indexOf(comparing ? (effectiveStage as CompareStage) : compareStage) + (comparing ? 1 : 0)) % compareModes.length]);
  };

  /** After a decision: the next image in order that still needs review. */
  const advance = (decided: readonly string[]) => {
    const done = new Set(decided);
    for (let i = at; i < all.length; i++) {
      const caps = sortedCaptures(all[i].checkpoint).filter((c) => !done.has(c.id) && NEEDS_REVIEW.includes(c.status));
      const candidate = variant ? caps.find((c) => c.variant === variant) : caps[0];
      if (i === at && !variant) continue;
      if (candidate) {
        onSelectionChange({ checkpointId: all[i].checkpoint.id, variant: variant ? candidate.variant : null });
        return;
      }
    }
  };

  const decide = (decision: ReviewDecisionInput['decision'], ids: string[], resolveThreads?: boolean) => {
    if (!onDecide || ids.length === 0) return;
    setConfirmApprove(false);
    onDecide({ captureIds: ids, decision, ...(decision === 'approved' && resolveThreads ? { resolveThreads: true } : {}) });
    if (decision === 'approved' && resolving) {
      // Approved: its change requests are done, and its comments too when they were resolved with it.
      const approved = new Set(ids);
      const done = new Set(handled);
      for (const it of resolving.items) if (approved.has(it.captureId) && (it.kind === 'request' || resolveThreads)) done.add(it.key);
      setHandled(done);
      if (!item || done.has(item.key)) goOnFrom(item, done);
    } else if (decision === 'approved') advance(ids);
    // Asking for changes with nothing pinned yet: point at what should change.
    else if (canComment && openCount === 0) toggleCommenting(true);
  };
  /** Approve, or first ask what happens to the open threads. */
  const approve = () => {
    if (openCount > 0 && canComment) {
      setConfirmApprove(true);
      requestAnimationFrame(() => approveRef.current?.focus());
    } else decide('approved', shown.map((c) => c.id));
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
      // ⌘Z / Ctrl+Z takes back the last drawing drawn or erased.
      if (commenting && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && drawHistory.length) {
        e.preventDefault();
        undoDrawing();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Arrow keys inside a toggle group move between its options, and in the pin layer move its crosshair.
      if (e.key.startsWith('Arrow') && target?.closest('[data-slot="toggle-group"], [data-slot="pin-layer"], [data-slot="compare-split"]')) return;
      // A popover or menu open over the viewer handles its own keys.
      if (target?.closest('[data-slot="popover-content"], [data-slot="select-content"], [role="menu"]')) return;
      const key = e.key.toLowerCase();
      if (e.key === 'Escape' && commenting) {
        // Out of comment mode first; a second Escape closes the viewer.
        e.stopPropagation();
        toggleCommenting(false);
      } else if (e.key === 'Escape' && verifying) {
        e.stopPropagation();
        verify(null);
      } else if (resolving && (e.key === ']' || e.key === '[')) stepItem(e.key === ']' ? 1 : -1);
      else if (verifying && (e.key === ']' || e.key === '[')) stepVerify(e.key === ']' ? 1 : -1);
      else if ((verifying || resolving) && key === 'e' && canComment && cardThread?.status === 'open') resolveVerified();
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowDown') moveFlow(1);
      else if (e.key === 'ArrowUp') moveFlow(-1);
      else if (key === 'v') cycleVariant();
      else if (key === 'f') setFrame({ ...frameSettings, fill: !fill });
      else if (key === 'm') cycleStage(e.shiftKey);
      else if (key === 'n' && regions.length) moveRegion(1);
      else if (key === 'p' && regions.length) moveRegion(-1);
      else if (key === 'c' && canComment) toggleCommenting();
      else if (key === 'i') setPanel({ open: !panel.open });
      else if (key === 'd') setDetailsOpen((o) => !o);
      else if (commenting && /^[1-9]$/.test(e.key) && Number(e.key) <= COMMENT_TOOLS.length) setTool(COMMENT_TOOLS[Number(e.key) - 1]);
      else if (e.key === ']') stepThread(1);
      else if (e.key === '[') stepThread(-1);
      else if (key === 'h' && shownThreads.length) setPinsHidden((h) => !h);
      else if (key === 'o' && resolving && item) setVerifying((on) => !on);
      else if (key === 'o' && (verifying || verifyQueue.length)) verify(verifying ? null : (verifyQueue.find((t) => t.id === openThreadId)?.id ?? undefined));
      else if (key === 'e' && canComment && openThreadId && comments.onSetThreadStatus) {
        const t = shownThreads.find((x) => x.id === openThreadId);
        if (t) comments.onSetThreadStatus({ threadId: t.id, status: t.status === 'open' ? 'resolved' : 'open', captureId: threadGroups.find((g) => g.threads.includes(t))?.captureId });
      } else if (key === 'r' && canComment && current) {
        // The composer is in the side panel.
        if (!panel.open) setPanel({ open: true });
        setComposing(true);
      }
      else if (key === 'l' && effectiveStage === 'side-by-side') setSyncScroll((on) => !on);
      else if (key === 'a' && deciding && !busy) approve();
      else return;
      e.preventDefault();
    };
    // Capture phase: the dialog's own handlers stop arrow keys before they bubble.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const label = pos ? checkpointLabel(pos.checkpoint.name, pos.checkpoint.title) : '';
  /** What a screen as it is now is called on the stage. */
  const nowLabel = (c: ReviewCaptureView) => `Now${c.runNumber ? ` · run #${c.runNumber}` : library ? '' : ' · this run'}`;

  // Going through feedback, the side panel is about it: the round, the one on show, and the rest to jump to.
  const feedbackMode = Boolean(resolving || verifying);
  const excerptOf = (t: ReviewThreadView | null | undefined) => {
    const body = (t ? openingComment(t)?.body : '') ?? '';
    return body.length > 90 ? `${body.slice(0, 89)}…` : body || 'A drawing';
  };
  const feedbackEntries: FeedbackEntry[] = resolving
    ? resolving.items.map((it) => {
        const p = all.find((x) => x.checkpoint.id === it.checkpointId || x.checkpoint.aliases?.includes(it.checkpointId));
        const cap = p?.checkpoint.captures.find((c) => c.id === it.captureId);
        const t = it.threadId ? cap?.threads?.find((x) => x.id === it.threadId) : null;
        return {
          key: it.key,
          screen: p ? `${p.checkpoint.sequence + 1}. ${checkpointLabel(p.checkpoint.name, p.checkpoint.title)} · ${it.variant}` : it.variant,
          number: it.number,
          excerpt: it.kind === 'request' ? 'Changes requested without a comment' : excerptOf(t),
          stage: it.stage,
          done: isDone(it),
        };
      })
    : verifyQueue.map((t) => ({
        key: t.id,
        screen: shown.find((c) => c.threads?.some((x) => x.id === t.id))?.variant ?? label,
        number: t.number,
        excerpt: excerptOf(t),
        stage: 'verify' as const,
        done: t.status !== 'open' || verified.has(t.id),
      }));

  const assistant = comments.assistant ?? null;
  const screenName = pos ? `${pos.flow.titlePath.join(' › ')} › ${label}` : label;
  /** "Fix with AI" for some comments of a capture. */
  const aiMenu = (captureId: string, threads: readonly ReviewThreadView[], opts: { iconOnly?: boolean; label?: string } = {}) =>
    assistant && threads.length ? (
      <DebugWithAiMenu
        prompt={fixCommentsPrompt({ captureId, threads: threads.map((t) => t.number), project: assistant.project, screen: `${screenName} (${shown.find((c) => c.id === captureId)?.variant ?? ''})` })}
        setupHref={assistant.setupHref}
        label={opts.label ?? 'Fix with AI'}
        size="xs"
        iconOnly={opts.iconOnly}
      />
    ) : null;

  // The keys that do something here, for the details.
  const shortcuts = SHORTCUTS.filter(([keys]) => (deciding || keys[0] !== 'A') && (canComment || !['C', 'R', 'E', '1–6', '⌘Z'].includes(keys[0])));

  /** Approve or ask for changes; with open comments, approving first asks what happens to them. */
  const decisionSection = deciding ? (
    <section className="flex flex-col gap-2" aria-label="Decision">
      {confirmApprove ? (
        <div className="flex animate-rise-in flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-2.5" role="group" aria-label="Open comments">
          <p className="text-label-s">
            {openCount} open {openCount === 1 ? 'comment' : 'comments'} on {shown.length > 1 ? 'these images' : 'this image'}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={approveRef} size="sm" disabled={busy} onClick={() => decide('approved', shown.map((c) => c.id), true)}>
              <Check /> Resolve and approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('approved', shown.map((c) => c.id))}>
              Approve, keep open
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmApprove(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={approve}>
            <Check /> {busy ? 'Saving…' : shown.length > 1 ? `Approve ${shown.length} images` : 'Approve'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('changes_requested', shown.map((c) => c.id))}>
            <MessageSquareWarning /> Request changes
          </Button>
        </div>
      )}
    </section>
  ) : null;

  /** The pins of one capture on its frame; `on` draws only some of its threads (the rest are on the image beside it). */
  const pinLayer = (capture: ReviewCaptureView, name: string, on?: { threads: readonly ReviewThreadView[]; ghosts?: readonly ReviewThreadView[]; origin?: boolean }) =>
    pinsOn && (canComment || capture.threads?.length || capture.drawings?.length) ? (
      <PinLayer
        captureId={capture.id}
        threads={on?.threads ?? capture.threads ?? []}
        // Drawings are on the pixels they were drawn on: not on the version commented on, beside it.
        drawings={on ? undefined : capture.drawings}
        onDraw={(shape, imageSize) => draw(capture.id, shape, imageSize)}
        onErase={(gone) => erase(capture.id, gone, capture.image.width && capture.image.height ? { width: capture.image.width, height: capture.image.height } : null)}
        ghosts={on?.ghosts}
        onOrigin={on?.origin}
        renderActions={(t) => (t.status === 'open' ? aiMenu(capture.id, [t], { iconOnly: true, label: `Fix comment ${t.number} with AI` }) : null)}
        label={name}
        commenting={commenting && canComment && !on?.origin}
        tool={tool}
        color={color}
        showResolved={threadFilter !== 'open'}
        hidden={pinsHidden}
        // The thread being verified is in the side panel, not in a popover over the screen it is about.
        openThreadId={verifying && openThreadId === cardThread?.id ? null : openThreadId}
        onOpenThreadChange={(id, from) => {
          // A popover closing late must not shut the one that just opened.
          if (id === null && from && from !== openThreadId) return;
          openThread(id);
        }}
        draft={on?.origin ? null : draft}
        onDraftChange={setDraft}
        focus={focus}
        now={comments.now}
        viewerId={comments.viewerId}
        canComment={canComment}
        canModerate={comments.canModerate}
        onCreateThread={comments.onCreateThread}
        onReply={comments.onReply}
        onSetThreadStatus={comments.onSetThreadStatus}
        onEditComment={comments.onEditComment}
        onDeleteComment={comments.onDeleteComment}
        onCompareThread={(id) => verify(id)}
      />
    ) : null;

  /** One screen on show, compared the way picked: its changes marked, beside its reference, or under it. */
  const comparison = (x: Compared, at: readonly FrameSize[]) => {
    const c = x.capture;
    const name = multi ? `${label}, ${c.variant}` : label;
    const variantName = multi ? <span className="capitalize">{c.variant}</span> : null;
    const currentTitle = library ? (c.compare || !c.runNumber ? 'This one' : `Run #${c.runNumber}`) : 'This run';
    // A screen of several with nothing to show this way: as it is, saying why.
    const plain = (note: string) => (
      <StagePane
        key={c.id}
        fill={fill}
        caption={
          <>
            {variantName}
            <span>{note}</span>
          </>
        }
      >
        <ScreenFrame image={c.image} frame={at[0]} zoom={zoom} live room={tall} alt={`${label} — ${c.variant}`} label={`${name} screen`} overlay={pinLayer(c, name) ? () => pinLayer(c, name) : undefined} />
      </StagePane>
    );
    if (!x.reference) return plain('Nothing to compare with yet');
    if (effectiveStage === 'changes') {
      if (!x.changes || !x.diff) return plain(x.reference.same ? `Identical to ${x.reference.label.toLowerCase()}` : x.diff?.state === 'done' ? 'No changes measured' : 'Not measured yet');
      const count = diffUnder(x.diff, maskPolicy).regions.length;
      return (
        <StagePane
          key={c.id}
          fill={fill}
          caption={
            multi ? (
              <>
                {variantName}
                <span className="tabular-nums">
                  {count} {count === 1 ? 'change' : 'changes'}
                </span>
              </>
            ) : null
          }
        >
          <DiffHighlight
            image={c.image}
            diff={diffUnder(x.diff, maskPolicy)}
            frame={at[0]}
            zoom={zoom}
            live
            room={tall}
            alt={name}
            active={multi ? (activeOf[c.id] ?? null) : activeRegion}
            onActiveChange={multi ? (i) => setActiveOf((a) => ({ ...a, [c.id]: i })) : setActiveRegion}
            minimapLabel={multi ? `Where the changes are, ${c.variant}` : undefined}
            ignored={c.ignoreRegions}
          >
            {pinLayer(c, name)}
          </DiffHighlight>
        </StagePane>
      );
    }
    if (effectiveStage === 'side-by-side') {
      // A comment placed on the image shown on the left is drawn there, where it was placed; the right shows where it lands now.
      const split = onReference(c.threads ?? [], x.reference.captureId);
      const sides = [
        {
          key: 'reference',
          title: x.reference.label,
          note: split.here.length ? `${split.here.length} ${split.here.length === 1 ? 'comment' : 'comments'} made here` : null,
          image: x.reference.image,
          frame: at[0],
          overlay: split.here.length ? pinLayer(c, `${name}, ${x.reference.label}`, { threads: split.here, origin: true }) : null,
        },
        { key: 'current', title: currentTitle, note: null, image: c.image, frame: at[1] ?? at[0], overlay: pinLayer(c, `${name}, ${currentTitle}`, { threads: split.rest, ghosts: split.ghosts }) },
      ];
      return (
        <SyncedPanes key={c.id} fill={fill} enabled={syncScroll}>
          {sides.map((side) => (
            <StagePane
              key={side.key}
              fill={fill}
              caption={
                <>
                  {variantName}
                  {side.title}
                  {side.note ? (
                    <span className="inline-flex items-center gap-1 text-label-xs text-accent-text">
                      <History aria-hidden className="size-3" /> {side.note}
                    </span>
                  ) : null}
                </>
              }
            >
              <ScreenFrame image={side.image} frame={side.frame} zoom={zoom} live room={tall} alt={`${label} — ${multi ? `${c.variant}, ` : ''}${side.title}`} overlay={side.overlay ? () => side.overlay : undefined} />
            </StagePane>
          ))}
        </SyncedPanes>
      );
    }
    // Slider, difference and overlay: the two images in one, its control (but the slider's) above it.
    const control = effectiveStage === 'slider' ? 0 : 40;
    return (
      <StagePane
        key={c.id}
        fill={fill}
        caption={
          multi ? (
            <>
              {variantName}
              <span>
                {x.reference.label} vs. {currentTitle}
              </span>
            </>
          ) : null
        }
      >
        <div
          role="region"
          aria-label={`${name}, comparison`}
          tabIndex={0}
          className={cn('mx-auto overflow-x-hidden overflow-y-auto outline-none', fill ? null : 'rounded-md ring-1 ring-border', 'focus-visible:ring-[3px] focus-visible:ring-ring/40')}
          style={{ width: liveWidth(at[0].width, zoom), height: `calc(${liveHeight(at[0].height, zoom, tall)} + ${control}px)` }}
        >
          <ImageCompare
            current={c.image}
            reference={x.reference.image}
            mode={effectiveStage as CompareMode}
            referenceLabel={x.reference.label}
            currentLabel={currentTitle}
            alt={name}
            scaled={{ width: at[0].width, zoom: `var(${SCREEN_ZOOM_VAR}, ${zoom})` }}
          />
        </div>
      </StagePane>
    );
  };

  return (
    <Dialog open={Boolean(pos)} onOpenChange={(open) => !open && onSelectionChange(null)}>
      <DialogContent
        showCloseButton={false}
        initialFocus={stageRef}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 p-0 sm:max-w-none lg:block lg:overflow-hidden"
      >
        {pos ? (
          <>
            <header
              ref={setHeaderEl}
              className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-popover/85 px-4 py-3 backdrop-blur-sm lg:absolute lg:inset-x-0"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <StatusIcon status={pos.flow.outcome} />
                <div className="min-w-0">
                  <DialogTitle className="truncate text-title-s" title={label}>
                    {pos.checkpoint.sequence + 1}. {label}
                  </DialogTitle>
                  <DialogDescription className="truncate text-xs text-muted-foreground" title={pos.flow.titlePath.join(' › ')}>
                    {pos.flow.titlePath.join(' › ')} · {pos.index + 1} of {pos.flow.checkpoints.length} shown
                  </DialogDescription>
                </div>
              </div>
              <ToggleGroup
                variant="segment"
                size="sm"
                value={[variant ?? 'all']}
                onValueChange={(v) => {
                  const next = v[0];
                  if (next) onSelectionChange({ checkpointId: pos.checkpoint.id, variant: next === 'all' ? null : String(next) });
                }}
                aria-label="Variant"
              >
                {captures.map((c) => (
                  <ToggleGroupItem key={c.variant} value={c.variant} className="gap-1.5 capitalize">
                    {library ? null : <ReviewStatusDot status={c.status} />}
                    {c.variant}
                  </ToggleGroupItem>
                ))}
                {captures.length > 1 ? <ToggleGroupItem value="all">All</ToggleGroupItem> : null}
              </ToggleGroup>
              {canCompare ? (
                // First what to look at — the screen, or how it changed — then, comparing, how the two are put together.
                <div className="flex flex-wrap items-center gap-2">
                  <ToggleGroup
                    variant="segment"
                    size="sm"
                    value={verifying || effectiveStage === 'ignore' ? [] : [comparing ? 'compare' : 'image']}
                    onValueChange={(v) => {
                      // Either leaves the walk through the comments to verify.
                      const next = v[0] ?? (verifying ? (comparing ? 'compare' : 'image') : null);
                      if (!next) return;
                      setVerifying(false);
                      showStage(next === 'compare' ? compareStage : 'image');
                    }}
                    aria-label="View"
                  >
                    <ToggleGroupItem value="image" title={library ? 'The screen as the newest run captured it' : 'The screen as this run captured it'}>
                      Image
                    </ToggleGroupItem>
                    <ToggleGroupItem value="compare" title="How the screen changed against what it is compared with (M)">
                      Compare
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {comparing && !verifying ? (
                    <ToggleGroup
                      variant="segment"
                      size="sm"
                      value={[effectiveStage]}
                      onValueChange={(v) => {
                        if (v[0]) showStage(v[0] as CompareStage);
                      }}
                      aria-label="Comparison"
                      className="animate-rise-in"
                    >
                      {compareModes.map((m) => (
                        <ToggleGroupItem key={m} value={m}>
                          {m === 'changes' ? 'Changes' : COMPARE_MODE_LABELS[m]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  ) : null}
                </div>
              ) : null}
              {current && compareWith && comparing ? <CompareTargetPicker capture={current} referenceLabel={reference?.label ?? null} {...compareWith} /> : null}
              <div className="ml-auto flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label="Previous checkpoint" disabled={at <= 0} onClick={() => move(-1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-9 text-center text-xs text-muted-foreground tabular-nums">
                    {at + 1} / {all.length}
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label="Next checkpoint" disabled={at >= all.length - 1} onClick={() => move(1)}>
                    <ChevronRight />
                  </Button>
                </div>
                <div className="h-5 w-px bg-border" aria-hidden />
                <div className="flex items-center gap-0.5">
                  <CheckpointDetails flow={pos.flow} checkpoint={pos.checkpoint} capture={current ?? shown[0] ?? null} library={library} shortcuts={shortcuts} open={detailsOpen} onOpenChange={setDetailsOpen} />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size={panel.open || !openCount ? 'icon-sm' : 'sm'}
                          aria-label={panel.open ? 'Hide the side panel' : `Show the side panel${openCount ? `, ${openCount} open ${openCount === 1 ? 'comment' : 'comments'}` : ''}`}
                          aria-expanded={panel.open}
                          aria-controls="checkpoint-panel"
                          aria-keyshortcuts="I"
                          onClick={() => setPanel({ open: !panel.open })}
                        />
                      }
                    >
                      {panel.open ? <PanelRightClose /> : <PanelRightOpen />}
                      {/* Folded away, the panel still says there is something to read in it. */}
                      {!panel.open && openCount ? <span className="rounded-full bg-accent-subtle px-1.5 text-label-xs text-accent-text tabular-nums">{openCount}</span> : null}
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {panel.open ? 'Hide' : 'Show'} the side panel <Kbd>I</Kbd>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
                  <X />
                </DialogClose>
              </div>
            </header>

            <div
              ref={gridRef}
              // Beside the stage the panel has the second column, which opens and closes over the motion's time.
              className={cn('grid shrink-0 grow grid-cols-1 lg:h-full lg:min-h-0 lg:transition-[grid-template-columns]', PANEL_MOTION)}
              style={overlaid ? { gridTemplateColumns: panelColumns(panel.open ? panel.width : null) } : undefined}
            >
              {/* The container the screens take their size from (see `zoomCss`): its height too, beside the panel. */}
              <section data-float-bounds className="relative flex min-h-0 flex-col bg-surface [container-type:inline-size] lg:[container-type:size]" aria-label="Checkpoint image">
                <div
                  ref={setToolbarEl}
                  className="z-20 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface/85 px-4 py-2 backdrop-blur-sm lg:absolute lg:inset-x-0"
                  style={overlaid ? { top: headerHeight } : undefined}
                >
                  <FrameToolbar value={frameSettings} onChange={setFrame} captured={current ? captureViewport(current) : null} maxZoom={stageSize.width > 0 ? maxZoom : undefined} />
                  <div className="flex items-center gap-3">
                    {effectiveStage === 'changes' && regions.length ? (
                      <div className="flex items-center gap-0.5" role="group" aria-label="Changes">
                        <Button variant="ghost" size="icon-sm" aria-label="Previous change" onClick={() => moveRegion(-1)}>
                          <ChevronLeft />
                        </Button>
                        <span className="min-w-24 text-center text-label-s text-muted-foreground tabular-nums" aria-live="polite">
                          {activeRegion == null ? `${regions.length} ${regions.length === 1 ? 'change' : 'changes'}` : `Change ${activeRegion + 1} of ${regions.length}`}
                        </span>
                        <Button variant="ghost" size="icon-sm" aria-label="Next change" onClick={() => moveRegion(1)}>
                          <ChevronRight />
                        </Button>
                      </div>
                    ) : null}
                    {effectiveStage === 'changes' && (rawAvailable || compared.some((x) => rawOf(x.diff))) ? (
                      <ToggleGroup
                        variant="segment"
                        size="sm"
                        value={[maskPolicy]}
                        onValueChange={(v) => {
                          if (v[0]) {
                            setMaskPolicy(v[0] as MaskPolicy);
                            setActiveRegion(null);
                            setActiveOf({});
                          }
                        }}
                        aria-label="Which changes"
                      >
                        <ToggleGroupItem value="effective" title="What counts: the changes outside the areas left out">
                          With rules
                        </ToggleGroupItem>
                        <ToggleGroupItem value="raw" title="Every changed pixel, areas left out included">
                          Raw
                        </ToggleGroupItem>
                      </ToggleGroup>
                    ) : null}
                    {canIgnore ? (
                      <Button variant={effectiveStage === 'ignore' ? 'secondary' : 'ghost'} size="sm" aria-pressed={effectiveStage === 'ignore'} onClick={() => setStage(effectiveStage === 'ignore' ? 'changes' : 'ignore')}>
                        <EyeOff /> Leave out areas{current?.ignore?.active ? ` (${current.ignore.active})` : ''}
                      </Button>
                    ) : null}
                    {effectiveStage === 'side-by-side' ? (
                      <Button variant={syncScroll ? 'secondary' : 'ghost'} size="xs" aria-pressed={syncScroll} title="Scroll both screens together (L)" onClick={() => setSyncScroll((on) => !on)}>
                        {syncScroll ? <Link2 /> : <Link2Off />} Scroll together
                      </Button>
                    ) : null}
                    {shownThreads.some((t) => t.anchor.kind !== 'image') && pinsOn ? (
                      <Button variant="ghost" size="xs" aria-pressed={pinsHidden} onClick={() => setPinsHidden((h) => !h)}>
                        {pinsHidden ? <EyeOff /> : <Eye />} {pinsHidden ? 'Pins hidden' : 'Pins'}
                      </Button>
                    ) : null}
                    <span className="text-label-s text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
                  </div>
                </div>
                <div
                  ref={(el) => {
                    stageRef.current = el;
                    setStageEl(el);
                  }}
                  tabIndex={0}
                  aria-label="Checkpoint screens"
                  className={cn(
                    // Its focus ring is drawn by the frame after it, around the part the bars leave clear.
                    'peer min-h-0 flex-1 outline-none',
                    // The screens fit; only a comparison while verifying, the summary after resolving and the editor's list below
                    // the screen can run longer.
                    verifying || (resolving && ended) || effectiveStage === 'ignore' ? 'overflow-auto' : 'overflow-hidden',
                    // Filling, the screens lose their frame and run to the stage's edges.
                    fill
                      ? 'p-0 [&_[data-slot=diff-highlight]]:rounded-none [&_[data-slot=diff-highlight]]:shadow-none [&_[data-slot=diff-highlight]]:ring-0 [&_[data-slot=screen-frame]]:rounded-none [&_[data-slot=screen-frame]]:shadow-none [&_[data-slot=screen-frame]]:ring-0'
                      : 'p-6',
                    // The screen running under the bars keeps their room clear at its ends, and scrolls things into view below them.
                    bleed &&
                      '[&_[data-slot=screen-frame]]:pt-(--stage-top) [&_[data-slot=screen-frame]]:pb-(--stage-bottom) [&_[data-slot=screen-frame]]:scroll-pt-(--stage-top) [&_[data-slot=screen-frame]]:scroll-pb-(--stage-bottom)',
                  )}
                  style={
                    {
                      [SCREEN_ZOOM_VAR]: zoomCss,
                      [SCREEN_ROOM_VAR]: roomCss,
                      ...(overlaid
                        ? {
                            '--stage-top': `${inset.top}px`,
                            '--stage-bottom': `${inset.bottom}px`,
                            // Whatever the stage itself scrolls (a comparison while verifying, the areas left out) starts below the bars too.
                            paddingTop: bleed ? 0 : inset.top + (fill ? 0 : 24),
                            paddingBottom: bleed ? 0 : inset.bottom + (fill ? 0 : 24),
                            scrollPaddingTop: inset.top,
                            scrollPaddingBottom: inset.bottom,
                          }
                        : {}),
                    } as React.CSSProperties
                  }
                >
                  {resolving && ended ? (
                    <ResolveDone
                      resolved={doneCount}
                      open={resolving.items.length - doneCount}
                      scope={resolving.scope}
                      onRestart={() => changeScope(resolving.scope)}
                      onClose={() => onSelectionChange(null)}
                    />
                  ) : requestCapture && requestShown ? (
                    <SyncedPanes fill={fill} enabled={syncScroll}>
                      {comparesTwo ? (
                        <StagePane
                          fill={fill}
                          caption={
                            <>
                              <History aria-hidden className="size-3.5" /> Asked about{requestShown.runNumber ? ` · run #${requestShown.runNumber}` : ''}
                            </>
                          }
                        >
                          {requestThen ? (
                            <ScreenFrame image={requestThen} frame={paneFrames[0][0]} zoom={zoom} live room={tall} alt={`${label} — the version changes were asked for on`} eager />
                          ) : (
                            <MissingScreen frame={paneFrames[0][0]} zoom={zoom} room={tall}>
                              The image the changes were asked for on is not shown here.
                            </MissingScreen>
                          )}
                        </StagePane>
                      ) : null}
                      <StagePane fill={fill} caption={nowLabel(requestCapture)}>
                        <ScreenFrame image={requestCapture.image} frame={paneFrames[0][comparesTwo ? 1 : 0]} zoom={zoom} live room={tall} alt={`${label} — now`} label={`${label}, now`} eager />
                      </StagePane>
                    </SyncedPanes>
                  ) : verifying && comparedThread && comparedCapture ? (
                    <SyncedPanes fill={fill} enabled={syncScroll}>
                      {comparesTwo ? (
                        <StagePane
                          fill={fill}
                          caption={
                            <>
                              <History aria-hidden className="size-3.5" /> Commented on{comparedThread.originRunNumber ? ` · run #${comparedThread.originRunNumber}` : ''}
                            </>
                          }
                        >
                          {comparedThread.origin ? (
                            <ScreenFrame
                              image={comparedThread.origin.image}
                              frame={paneFrames[0][0]}
                              zoom={zoom}
                              live
                              room={tall}
                              alt={`${label} — the version commented on`}
                              label={`${label}, the version commented on`}
                              eager
                              overlay={() => <OriginMarker number={comparedThread.number} anchor={comparedThread.origin!.anchor} markup={comparedThread.origin!.markup} />}
                            />
                          ) : (
                            <MissingScreen frame={paneFrames[0][0]} zoom={zoom} room={tall}>
                              The image this comment was made on is no longer stored.
                            </MissingScreen>
                          )}
                        </StagePane>
                      ) : null}
                      <StagePane fill={fill} caption={nowLabel(comparedCapture)}>
                        <ScreenFrame
                          image={comparedCapture.image}
                          frame={paneFrames[0][comparesTwo ? 1 : 0]}
                          zoom={zoom}
                          live
                          room={tall}
                          alt={`${label} — now`}
                          label={`${label}, now`}
                          eager
                          overlay={pinLayer(comparedCapture, `${label}, now`) ? () => pinLayer(comparedCapture, `${label}, now`) : undefined}
                        />
                      </StagePane>
                    </SyncedPanes>
                  ) : verifying && !resolving ? (
                    <VerifyDone
                      count={verified.size}
                      onClose={() => verify(null)}
                      next={
                        deciding && shown.some((c) => NEEDS_REVIEW.includes(c.status)) ? (
                          <Button size="sm" disabled={busy} onClick={approve}>
                            <Check /> {shown.length > 1 ? `Approve ${shown.length} images` : 'Approve the screen'}
                          </Button>
                        ) : null
                      }
                    />
                  ) : current && effectiveStage === 'ignore' && onIgnoreRegionsChange ? (
                    <IgnoreRegionsEditor
                      captureId={current.id}
                      image={current.image}
                      imageSize={(measuredSize ?? ownSize)!}
                      frame={frames[0]}
                      zoom={zoom}
                      live
                      room={tall}
                      alt={label}
                      rules={current.ignore?.rules ?? []}
                      revision={current.ignore?.revision ?? 0}
                      prefill={prefill}
                      pending={ignorePendingId === current.id}
                      onPreview={onIgnorePreview && reference ? (regions) => onIgnorePreview({ captureId: current.id, regions }) : undefined}
                      preview={onIgnorePreview && reference ? ignorePreview : null}
                      onSave={(change) => {
                        onIgnoreRegionsChange(change);
                        setPrefill(null);
                        showStage('changes');
                      }}
                      onCancel={() => {
                        setPrefill(null);
                        showStage('changes');
                      }}
                    />
                  ) : comparing ? (
                    <div className={cn(paneRow(fill), fill && 'mx-auto')}>{compared.map((x, i) => comparison(x, paneFrames[i]))}</div>
                  ) : (
                    <div className={cn(paneRow(fill), fill && 'mx-auto')}>
                      {shown.map((c, i) => (
                        <StagePane
                          key={c.id}
                          fill={fill}
                          caption={
                            fill && captionless ? null : (
                              <>
                                <span className="capitalize">{c.variant}</span>
                                <span className="tabular-nums">
                                  {frames[i].width} × {frames[i].height}
                                </span>
                                {shown.length > 1 && !library ? <ReviewStatusBadge status={c.status} /> : null}
                              </>
                            )
                          }
                        >
                          <ScreenFrame
                            image={c.image}
                            frame={frames[i]}
                            zoom={zoom}
                            live
                            room={tall}
                            alt={`${label} — ${c.variant}`}
                            label={`${label}, ${c.variant} screen`}
                            overlay={pinLayer(c, `${label}, ${c.variant}`) ? () => pinLayer(c, `${label}, ${c.variant}`) : undefined}
                          />
                        </StagePane>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/25 peer-focus-visible:ring-inset"
                  style={{ top: inset.top, bottom: inset.bottom }}
                />
                {canComment && pinsOn && !verifying && !(resolving && ended) ? (
                  // Over the bottom of the screens, the way a drawing tool's bar floats: always at hand, never in the layout.
                  // Its grip moves it off whatever it covers, and the browser remembers where.
                  <div className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4" style={{ bottom: overlaid ? stripHeight : 16 }}>
                    <CommentBar
                      className="pointer-events-auto"
                      positionKey="review:comment-bar-position"
                      commenting={commenting}
                      onCommentingChange={toggleCommenting}
                      openCount={openCount}
                      tool={tool}
                      onToolChange={setTool}
                      color={color}
                      onColorChange={setColor}
                      canUndo={drawHistory.length > 0}
                      onUndo={undoDrawing}
                    />
                  </div>
                ) : null}
              </section>

              {(overlaid ? panelMounted : panel.open) ? (
                // Leaving, the panel is still here for its column to close over it; nothing in it can be reached meanwhile.
                <div className="relative flex min-h-0 flex-col" data-state={panel.open ? 'open' : 'closed'} inert={!panel.open || undefined} aria-hidden={!panel.open || undefined}>
                  {overlaid && panel.open ? (
                    <PanelResizer
                      label="Resize the side panel"
                      width={panel.width}
                      min={REVIEW_PANEL.min}
                      max={REVIEW_PANEL.max}
                      defaultWidth={REVIEW_PANEL.default}
                      onResizeStart={() => setResizing(true)}
                      onResize={movePanel}
                      onResizeEnd={(width) => {
                        setResizing(false);
                        movePanel(width);
                        setPanel({ width });
                      }}
                    />
                  ) : null}
                  {/* The column clips the panel, which keeps its width as the column moves: it slides in and out rather than squeezing. */}
                  <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
                    <aside
                      ref={asideRef}
                      id="checkpoint-panel"
                      className={cn(
                        'flex min-h-0 flex-1 flex-col gap-5 overflow-auto border-t border-border p-4 lg:shrink-0 lg:border-t-0 lg:border-l',
                        // And fades, in as it arrives and out as it leaves, in step with the column.
                        'lg:transition-opacity lg:starting:opacity-0 lg:in-data-[state=closed]:opacity-0',
                        PANEL_MOTION,
                      )}
                      // Under the header and the strip too: it starts below the one and scrolls clear of the other.
                      style={overlaid ? { width: panel.width, paddingTop: headerHeight + 16, scrollPaddingTop: headerHeight } : undefined}
                      aria-label="Review"
                    >
                    {feedbackMode ? (
                      <FeedbackPanel
                        mode={resolving ? 'resolve' : 'verify'}
                        entries={feedbackEntries}
                        currentKey={resolving ? (ended ? null : (item?.key ?? null)) : verifying ? verifyingId : null}
                        onGo={(key) => {
                          if (resolving) {
                            const it = resolving.items.find((i) => i.key === key);
                            if (it) go(it);
                          } else verify(key);
                        }}
                        onStep={(d) => (resolving ? stepItem(d) : stepVerify(d))}
                        scope={resolving?.scope}
                        counts={resolving?.counts}
                        onScopeChange={resolving ? changeScope : undefined}
                        comparing={verifying}
                        onComparingChange={resolving && item ? (next) => (next ? showItem(item) : setVerifying(false)) : undefined}
                        onClose={resolving ? undefined : () => verify(null)}
                      >
                        {cardThread && cardCapture ? (
                          <FeedbackThreadCard
                            thread={cardThread}
                            stage={cardThread.placement === 'outdated' ? 'verify' : 'waiting'}
                            currentRunNumber={cardCapture.runNumber}
                            captureId={cardCapture.id}
                            now={comments.now}
                            viewerId={comments.viewerId}
                            canComment={canComment}
                            canModerate={comments.canModerate}
                            onResolve={comments.onSetThreadStatus ? resolveVerified : undefined}
                            onNext={feedbackEntries.length > 1 ? () => (resolving ? stepItem(1) : stepVerify(1)) : undefined}
                            actions={cardThread.status === 'open' ? aiMenu(cardCapture.id, [cardThread], { iconOnly: true, label: `Fix comment ${cardThread.number} with AI` }) : null}
                            onReply={comments.onReply}
                            onEditComment={comments.onEditComment}
                            onDeleteComment={comments.onDeleteComment}
                          />
                        ) : itemRequestCapture && itemRequest ? (
                          <FeedbackRequestCard
                            request={itemRequest}
                            onApprove={deciding ? approve : undefined}
                            approving={busy}
                            onPin={
                              canComment
                                ? () => {
                                    setVerifying(false);
                                    toggleCommenting(true);
                                  }
                                : undefined
                            }
                            onNext={feedbackEntries.length > 1 ? () => stepItem(1) : undefined}
                          />
                        ) : null}
                        {/* Verifying the comments of one screen, deciding about it stays at hand. */}
                        {resolving ? null : decisionSection}
                      </FeedbackPanel>
                    ) : (
                      <>
                      <section className="flex flex-col gap-2">
                        {library ? null : (
                          <div className="flex flex-wrap gap-1.5">
                            {shown.map((c) => (
                              <ReviewStatusBadge key={c.id} status={c.status} label={shown.length > 1 ? `${c.variant}: ${statusWord(c)}` : undefined} />
                            ))}
                          </div>
                        )}
                        {library ? <LibraryStates captures={shown} /> : null}
                        {pos.checkpoint.origin ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <History className="size-3.5" /> Captured in run #{pos.checkpoint.origin.runNumber}: the newest run did not capture this screen.
                          </p>
                        ) : null}
                        {pos.checkpoint.description ? <p className="text-sm text-pretty">{pos.checkpoint.description}</p> : null}
                        {current?.decision ? <DecisionNote capture={current} /> : null}
                        {current?.request ? (
                          <ChangeRequestNote
                            request={current.request}
                            onPin={canComment ? () => toggleCommenting(true) : undefined}
                            onCompare={
                              !current.request.onThisImage && reference && reference.captureId === current.request.captureId
                                ? () => {
                                    setVerifying(false);
                                    showStage('side-by-side');
                                  }
                                : undefined
                            }
                          />
                        ) : null}
                        {compareFallback ? (
                          <p className="text-xs text-muted-foreground">
                            {compareFallback} {reference ? `Compared with ${reference.label.toLowerCase()} instead.` : ''}
                          </p>
                        ) : null}
                        {current && reference && diff && !reference.same ? (
                          <>
                            <DiffSummary diff={diff} referenceLabel={reference.label} />
                            {hasChanges ? (
                              <DiffRegionList
                                regions={regions}
                                ignored={current.ignoreRegions ?? []}
                                active={activeRegion}
                                onSelect={(i) => {
                                  setVerifying(false);
                                  if (effectiveStage !== 'changes') showStage('changes');
                                  setActiveRegion(i);
                                }}
                              />
                            ) : null}
                            {assistant && hasChanges && comparisonIdOf(reference.captureId, current.id) ? (
                              <VisualDiffAiActions
                                comparisonId={comparisonIdOf(reference.captureId, current.id)!}
                                regions={regions}
                                active={activeRegion}
                                project={assistant.project}
                                screen={`${screenName} (${current.variant})`}
                                setupHref={assistant.setupHref}
                              />
                            ) : null}
                          </>
                        ) : current && reference ? (
                          <p className="text-xs text-muted-foreground">{reference.same ? `Identical to ${reference.label.toLowerCase()}.` : `Differs from ${reference.label.toLowerCase()}.`}</p>
                        ) : current ? (
                          <p className="text-xs text-muted-foreground">Nothing to compare with yet: this is the first capture of this checkpoint.</p>
                        ) : null}
                        {current?.ignore?.ever ? <IgnoreNote capture={current} /> : null}
                        {current?.staleTolerance ? (
                          <p role="note" className="flex items-start gap-1.5 rounded-md border border-info-border bg-info-subtle p-2 text-xs text-info-text">
                            <History aria-hidden className="mt-px size-3.5 shrink-0" />
                            <span>Approved automatically on {formatDateTime(current.staleTolerance.at)} under earlier rules; the rules changed since, so the image is reviewed again.</span>
                          </p>
                        ) : null}
                        {analysis && current && reference && hasChanges ? (
                          <AnalysisPanel
                            allowed={analysis.allowed}
                            reason={analysis.reason}
                            mode={analysis.mode}
                            analyses={analysis.analyses}
                            pending={analysis.pending}
                            decidingId={analysis.decidingId}
                            onAnalyze={analysis.onAnalyze ? () => analysis.onAnalyze!({ captureId: current.id, baseCaptureId: reference.captureId }) : undefined}
                            onDecide={analysis.onDecide ? (input) => analysis.onDecide!({ ...input, captureId: current.id }) : undefined}
                            onFocusRegion={(id) => {
                              const i = regions.findIndex((r) => regionId(r) === id);
                              if (i < 0) return;
                              setVerifying(false);
                              if (effectiveStage !== 'changes') showStage('changes');
                              setActiveRegion(i);
                            }}
                            onEditRects={canIgnore ? (rects) => {
                              setPrefill(rects);
                              setStage('ignore');
                            } : undefined}
                          />
                        ) : null}
                      </section>

                      {decisionSection}

                      {canComment || shownThreads.length ? (
                        <ThreadList
                          groups={threadGroups}
                          filter={threadFilter}
                          onFilterChange={setThreadFilter}
                          openThreadId={openThreadId}
                          onOpenThreadChange={(id) => {
                            const t = id ? shownThreads.find((x) => x.id === id) : null;
                            // A thread with a pin opens at its pin; one about the whole image opens in the list.
                            if (t && t.anchor.kind !== 'image') {
                              setPinsHidden(false);
                              if (!pinsOn) setStage('image');
                            }
                            openThread(id, { focus: Boolean(t && t.anchor.kind !== 'image') });
                          }}
                          onHighlight={(id) => (id ? setFocus((f) => ({ threadId: id, nonce: (f?.nonce ?? 0) + 1, ping: true, scroll: false })) : undefined)}
                          emptyHint={
                            <>
                              No comments yet. Press <Kbd>C</Kbd> or use Comment below the screen to point at what should change.
                            </>
                          }
                          composing={composing}
                          onComposingChange={setComposing}
                          now={comments.now}
                          viewerId={comments.viewerId}
                          canComment={canComment}
                          canModerate={comments.canModerate}
                          onCreateThread={comments.onCreateThread}
                          onReply={comments.onReply}
                          onSetThreadStatus={comments.onSetThreadStatus}
                          onEditComment={comments.onEditComment}
                          onDeleteComment={comments.onDeleteComment}
                          onVerify={(id) => verify(id)}
                          headerActions={current ? aiMenu(current.id, (current.threads ?? []).filter((t) => threadStage(t) === 'waiting')) : null}
                        />
                      ) : null}
                      </>
                    )}
                    </aside>
                  </div>
                </div>
              ) : null}
            </div>

            {/* No bar of its own: the previews float over the screens' bottom-left corner, lifted off them by their shadow. */}
            <footer
              ref={(el) => {
                stripRef.current = el;
                setStripEl(el);
              }}
              className={cn('pointer-events-none z-30 lg:absolute lg:bottom-0 lg:left-0 lg:transition-[right]', PANEL_MOTION)}
              style={overlaid ? { right: panel.open ? panel.width : 0 } : undefined}
            >
              {/* Room around the previews inside the scrolling row, so neither their shadow nor the outline of the one on show is cut. */}
              <ol className="pointer-events-auto flex w-max max-w-full gap-3 overflow-x-auto p-4" aria-label={`Checkpoints of ${pos.flow.title}`}>
                {pos.flow.checkpoints.map((cp) => {
                  const first = sortedCaptures(cp).find((c) => !variant || c.variant === variant) ?? sortedCaptures(cp)[0];
                  const active = cp.id === pos.checkpoint.id;
                  return (
                    <li key={cp.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectionChange({ checkpointId: cp.id, variant })}
                        aria-current={active ? 'step' : undefined}
                        aria-label={`${cp.sequence + 1}. ${checkpointLabel(cp.name, cp.title)}`}
                        className={cn(
                          'relative block rounded-md outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/40',
                          active && 'ring-2 ring-accent-solid ring-offset-2 ring-offset-background',
                        )}
                      >
                        {first ? <ScreenFrame image={first.image} frame={captureViewport(first)} zoom={56 / captureViewport(first).height} alt="" scroll={false} className="shadow-e3" /> : null}
                        <span aria-hidden className="absolute top-1 left-1 rounded-sm bg-popover/90 px-1 text-label-xs text-popover-foreground tabular-nums shadow-e1">
                          {cp.sequence + 1}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </footer>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['←', '→'], 'Previous / next checkpoint'],
  [['↑', '↓'], 'Previous / next test'],
  [['V'], 'Next variant'],
  [['F'], 'Fill the space with the screens, or frame them again'],
  [['M'], 'Image or comparison'],
  [['⇧', 'M'], 'Next way of comparing'],
  [['N', 'P'], 'Next / previous change'],
  [['A'], 'Approve and go to the next image to review'],
  [['C'], 'Comment mode: click to pin, drag for an area'],
  [['1–6'], 'Comment mode: pin, pen, highlighter, arrow, rectangle, ellipse'],
  [['⌘Z'], 'Comment mode: undo the last shape drawn'],
  [['R'], 'Comment on the whole image'],
  [['[', ']'], 'Previous / next comment'],
  [['E'], 'Resolve or reopen the open comment'],
  [['H'], 'Hide or show the pins'],
  [['O'], 'Compare the comment with the version it was made on, or show the screen'],
  [['L'], 'Side by side: scroll both screens together, or apart'],
  [['I'], 'Show or hide the side panel'],
  [['D'], 'Details: step, URL, video, trace'],
  [['Esc'], 'Leave comment mode, then close'],
];


/** The checkpoint's rules and what they did to this comparison, in a line. */
function IgnoreNote({ capture }: { capture: ReviewCaptureView }) {
  const g = capture.ignore!;
  const parts = [
    g.active ? `${g.active} ${g.active === 1 ? 'area is' : 'areas are'} left out of the comparison` : 'Areas were left out once; none is switched on now',
    g.suspended ? `${g.suspended} not applied here: drawn on an image of another size` : null,
    g.suppressedPixels ? `${g.suppressedPixels.toLocaleString('en')} changed px left out${g.rawChangedPixels !== null ? ` of ${g.rawChangedPixels.toLocaleString('en')} raw` : ''}` : null,
  ].filter(Boolean);
  return (
    <p className={cn('flex items-start gap-1.5 text-xs', g.suspended ? 'text-warning-text' : 'text-muted-foreground')}>
      <EyeOff aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{parts.join(' · ')}.</span>
    </p>
  );
}

function statusWord(c: ReviewCaptureView) {
  return { approved: 'approved', changes_requested: 'changes requested', changed: 'changed', new: 'new' }[c.status];
}

function DecisionNote({ capture }: { capture: ReviewCaptureView }) {
  const d = capture.decision!;
  return (
    <div className="rounded-md border border-border bg-surface-sunken p-2 text-xs">
      <p className="text-muted-foreground">
        {d.source === 'tolerance' ? 'Approved automatically' : d.decision === 'approved' ? 'Approved' : 'Changes requested'}
        {d.by ? ` by ${d.by}` : ''} · {formatDateTime(d.at)}
        {d.runNumber ? ` · run #${d.runNumber}` : ''}
      </p>
      {/* A change request's comment lives on as a thread below. */}
      {d.comment && d.decision === 'approved' ? <p className="mt-1 text-sm text-pretty whitespace-pre-wrap">{d.comment}</p> : null}
    </div>
  );
}

/**
 * "Changes requested" without a comment: nobody said what, and no thread
 * carries it — so it is spelled out here, on the image asked about (pin what
 * should change) and on a newer one (compare it with the image asked about).
 */
function ChangeRequestNote({ request, onPin, onCompare }: { request: NonNullable<ReviewCaptureView['request']>; onPin?: () => void; onCompare?: () => void }) {
  const who = `${request.by ?? 'Someone'}${request.runNumber ? ` (run #${request.runNumber})` : ''}`;
  return (
    <div role="note" className={cn('flex flex-col gap-2 rounded-md border p-2.5 text-xs', request.onThisImage ? 'border-danger-border bg-danger-subtle text-danger-text' : 'border-info-border bg-info-subtle text-info-text')}>
      <p className="flex items-start gap-1.5">
        {request.onThisImage ? <MessageSquareWarning aria-hidden className="mt-px size-3.5 shrink-0" /> : <History aria-hidden className="mt-px size-3.5 shrink-0" />}
        <span>
          {request.onThisImage
            ? `${who} asked for changes to this image without saying what.`
            : `${who} asked for changes to an earlier version of this screen, without a comment. It changed since: check whether it is what was asked.`}
        </span>
      </p>
      {request.onThisImage && onPin ? (
        <Button size="xs" variant="outline" className="self-start bg-surface" onClick={onPin}>
          Pin what should change
        </Button>
      ) : null}
      {!request.onThisImage && onCompare ? (
        <Button size="xs" variant="outline" className="self-start bg-surface" onClick={onCompare}>
          Compare with the version asked about
        </Button>
      ) : null}
    </div>
  );
}

/** A row of screens: apart, each framed, or — filling the stage — meeting at a hairline. */
function paneRow(fill: boolean) {
  return fill ? 'flex w-max items-stretch gap-px bg-border' : 'flex min-w-max items-start justify-center gap-6';
}

/**
 * One screen of several on the stage, under its caption. Filling the stage, the
 * caption is a bar across the screen's top, ruled off like the toolbar above it.
 */
/** In place of a screen that is no longer stored: as large as it would be, saying why. */
function MissingScreen({ frame, zoom, room = false, children }: { frame: FrameSize; zoom: number; room?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center justify-center rounded-md bg-surface-sunken p-6 text-center text-label-s text-muted-foreground ring-1 ring-border" style={{ width: liveWidth(frame.width, zoom), height: liveHeight(frame.height, zoom, room) }}>
      {children}
    </div>
  );
}

function StagePane({ fill, caption, children }: { fill: boolean; caption: ReactNode; children: ReactNode }) {
  if (caption == null) return fill ? <div className="bg-surface">{children}</div> : <>{children}</>;
  return (
    <figure className={cn('flex flex-col', fill ? 'bg-surface' : 'gap-1.5')}>
      {/* As wide as its screen and no wider: a long caption is cut, never widening the row past the stage. */}
      <figcaption
        className={cn('flex w-0 min-w-full items-center gap-2 overflow-hidden text-label-s whitespace-nowrap text-muted-foreground', fill && 'shrink-0 border-b border-border px-3')}
        style={fill ? { height: PANE_BAR } : undefined}
      >
        {caption}
      </figcaption>
      {children}
    </figure>
  );
}

/** A screen beside its reference, scrolling together while `enabled`. */
function SyncedPanes({ fill, enabled, children }: { fill: boolean; enabled: boolean; children: ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useSyncedScroll(el, '[data-slot="screen-frame"]', enabled);
  return (
    <div ref={setEl} className={paneRow(fill)}>
      {children}
    </div>
  );
}

/** Whether something that leaves over `ms` is still there: at once when `open`, `ms` after it closes. */
function usePresence(open: boolean, ms: number) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), ms);
    return () => window.clearTimeout(timer);
  }, [open, ms]);
  return present || open;
}

/**
 * The content box of an element, followed as it resizes; zero until it mounts.
 * A resize under way (the panel's edge dragged, the window resized) is read
 * once it has rested for a moment: what is laid out from it follows by CSS
 * meanwhile, and nothing here needs a render on every frame of it. Until then
 * the element carries `MOVING_ATTR`, which puts what it shows on the GPU.
 */
function useElementSize(el: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setSize((cur) => (cur.width === el.clientWidth && cur.height === el.clientHeight ? cur : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    let timer = 0;
    let first = true;
    const observer = new ResizeObserver(() => {
      // The first notice is the size it mounted at, measured above.
      if (first) {
        first = false;
        return;
      }
      if (!el.hasAttribute(MOVING_ATTR)) el.setAttribute(MOVING_ATTR, '');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        el.removeAttribute(MOVING_ATTR);
        measure();
      }, 120);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      el.removeAttribute(MOVING_ATTR);
    };
  }, [el]);
  return size;
}

/** The height of an element with its border, followed as it resizes; zero until it mounts. */
function useOuterHeight(el: HTMLElement | null) {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return height;
}

/** The window's height while the viewer is stacked (below `lg`, where it scrolls as a page); null beside the side panel. */
function useStackedHeight() {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const mql = window.matchMedia('(min-width: 64rem)');
    const measure = () => setHeight(mql.matches ? null : window.innerHeight);
    measure();
    mql.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    return () => {
      mql.removeEventListener('change', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);
  return height;
}

/** Where the screens on show stand in the review loop, in the library (in place of a run's statuses). */
function LibraryStates({ captures }: { captures: readonly ReviewCaptureView[] }) {
  const states = new Set<LibraryState>(captures.flatMap((c) => [...captureStates(c)]));
  const shown = (['waiting', 'verify', 'updated'] as const).filter((s) => states.has(s));
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <LibraryStateChip key={s} state={s} />
      ))}
    </div>
  );
}
