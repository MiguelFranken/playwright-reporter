/**
 * Comment threads on review images, Figma style: a numbered pin on a spot (or
 * an area) of a screenshot, a conversation under it, and a resolved state.
 * Plain data and geometry, so the database, the server, the MCP tools and the
 * views read one vocabulary.
 *
 * A thread belongs to an image's identity — a test's checkpoint and variant —
 * not to one run: it was placed on one capture (its origin) and stays on the
 * image's later captures while it is open. Where the pixels are the same as
 * the origin's the pin is `exact`; where the image changed since, `outdated`.
 *
 * Positions are stored in the origin image's own pixels, with its size, and
 * handed to views as fractions of the image they are drawn on, so a pin does
 * not care about zoom.
 */
import type { ReviewImage } from './review';

export const THREAD_STATUSES = ['open', 'resolved'] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

/** `point`: a pin; `area`: a rectangle with a pin at its corner; `image`: the whole image, no pin. */
export const ANCHOR_KINDS = ['point', 'area', 'image'] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

/** Where a comment was written: the app, an AI assistant over MCP, or the REST API. */
export const COMMENT_SOURCES = ['app', 'mcp', 'api'] as const;
export type CommentSource = (typeof COMMENT_SOURCES)[number];

/** A comment, or an event in the thread's history. */
export const COMMENT_KINDS = ['comment', 'resolved', 'reopened'] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export const MAX_COMMENT_LENGTH = 4000;

/** `exact`: drawn on the pixels it was placed on; `outdated`: the image changed since. */
export type ThreadPlacement = 'exact' | 'outdated';

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Where a thread points. In pixels of some image (stored: the origin's) or,
 * as a `FractionAnchor`, in fractions of the image it is drawn on.
 */
export interface ThreadAnchor {
  kind: AnchorKind;
  x: number;
  y: number;
  w?: number | null;
  h?: number | null;
}

/** An anchor in fractions (0–1) of the image it is drawn on. `image` anchors are 0, 0. */
export type FractionAnchor = ThreadAnchor;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * An anchor in `from` pixels, onto an image of `to` pixels, as fractions of
 * `to`. Captures of one checkpoint and variant differ in height (a full page
 * grew) more often than in width, and the page is laid out from the top, so
 * the anchor is scaled by the widths and kept at its distance from the top.
 */
export function projectAnchor(anchor: ThreadAnchor, from: ImageSize, to?: ImageSize | null): FractionAnchor {
  if (anchor.kind === 'image') return { kind: 'image', x: 0, y: 0, w: null, h: null };
  const target = to?.width && to.height ? to : from;
  const scale = target.width / from.width;
  const x = clamp01((anchor.x * scale) / target.width);
  const y = clamp01((anchor.y * scale) / target.height);
  if (anchor.kind === 'point' || anchor.w == null || anchor.h == null) return { kind: 'point', x, y, w: null, h: null };
  return { kind: 'area', x, y, w: Math.min(1 - x, clamp01((anchor.w * scale) / target.width)), h: Math.min(1 - y, clamp01((anchor.h * scale) / target.height)) };
}

/** A fraction anchor on an image of `size`, in that image's pixels (rounded). */
export function toPixels(anchor: FractionAnchor, size: ImageSize): ThreadAnchor {
  if (anchor.kind === 'image') return { kind: 'image', x: 0, y: 0, w: null, h: null };
  const x = Math.round(clamp01(anchor.x) * size.width);
  const y = Math.round(clamp01(anchor.y) * size.height);
  if (anchor.kind === 'point' || anchor.w == null || anchor.h == null) return { kind: 'point', x, y, w: null, h: null };
  return { kind: 'area', x, y, w: Math.max(1, Math.round(clamp01(anchor.w) * size.width)), h: Math.max(1, Math.round(clamp01(anchor.h) * size.height)) };
}

/**
 * The rectangle from one corner of a drag to the other, as an anchor: an area
 * when it is at least `minFraction` across, else a point where the drag began.
 */
export function anchorFromDrag(start: { x: number; y: number }, end: { x: number; y: number }, minFraction = 0.01): FractionAnchor {
  const x = clamp01(Math.min(start.x, end.x));
  const y = clamp01(Math.min(start.y, end.y));
  const w = clamp01(Math.abs(end.x - start.x));
  const h = clamp01(Math.abs(end.y - start.y));
  if (w < minFraction && h < minFraction) return { kind: 'point', x: clamp01(start.x), y: clamp01(start.y), w: null, h: null };
  return { kind: 'area', x, y, w: Math.max(w, minFraction), h: Math.max(h, minFraction) };
}

/** Whether an anchor is a valid fraction anchor: kinds known, numbers finite, inside the image. */
export function isFractionAnchor(anchor: unknown): anchor is FractionAnchor {
  if (!anchor || typeof anchor !== 'object') return false;
  const a = anchor as Record<string, unknown>;
  if (!(ANCHOR_KINDS as readonly unknown[]).includes(a.kind)) return false;
  if (a.kind === 'image') return true;
  const inside = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
  if (!inside(a.x) || !inside(a.y)) return false;
  if (a.kind === 'area') return inside(a.w) && inside(a.h) && (a.w as number) > 0 && (a.h as number) > 0;
  return true;
}

/** `(412, 880)`, `(120, 1400) 640×220`, `whole image`: an anchor in words, for text and tools. */
export function describeAnchor(anchor: ThreadAnchor): string {
  if (anchor.kind === 'image') return 'whole image';
  const at = `(${Math.round(anchor.x)}, ${Math.round(anchor.y)})`;
  return anchor.kind === 'area' && anchor.w != null && anchor.h != null ? `${at} ${Math.round(anchor.w)}×${Math.round(anchor.h)}` : at;
}

// ---------------------------------------------------------------- view models

export interface CommentAuthor {
  name: string;
  image?: string | null;
}

export interface ReviewCommentView {
  id: string;
  kind: CommentKind;
  body: string;
  author: CommentAuthor | null;
  source: CommentSource;
  at: string;
  editedAt?: string | null;
  /** Who wrote it, for telling the viewer's own comments (which they may edit and delete) apart. */
  authorId?: string | null;
  /** Being saved. */
  pending?: boolean;
}

export interface ReviewThreadView {
  id: string;
  /** Stable per image: the number on the pin, and how tools and people refer to the thread. */
  number: number;
  status: ThreadStatus;
  /** Where the pin is on the image it is shown with, in fractions of that image. */
  anchor: FractionAnchor;
  placement: ThreadPlacement;
  /** The run the thread was placed on. */
  originRunNumber?: number | null;
  /**
   * The image the thread was placed on, when the one it is shown with has
   * changed since (`outdated`) and the original is still stored: what the
   * comment was about, to compare with the screen as it is now. `anchor` is
   * where the pin sits on that image.
   */
  origin?: { captureId: string; checkpointId?: string | null; image: ReviewImage; anchor: FractionAnchor } | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  /** The first is the thread's opening comment; resolve and reopen events are in between. */
  comments: ReviewCommentView[];
  /** Being created: not yet a real thread. */
  pending?: boolean;
}

/** A new thread on a capture: where (fractions of the image as the viewer saw it) and what. */
export interface NewThreadInput {
  captureId: string;
  anchor: FractionAnchor;
  body: string;
  /** The image's natural size as the browser loaded it, for captures that did not record one. */
  imageSize?: ImageSize | null;
}

export interface ThreadReplyInput {
  threadId: string;
  body: string;
}

export interface ThreadStatusInput {
  threadId: string;
  status: ThreadStatus;
  /** The capture it is resolved on: a resolved thread stays visible there. */
  captureId?: string | null;
}

export interface CommentEditInput {
  commentId: string;
  body: string;
}

/** Everything the viewer can do to threads; the host records it. */
export interface ThreadActions {
  onCreateThread?: (input: NewThreadInput) => void;
  onReply?: (input: ThreadReplyInput) => void;
  onSetThreadStatus?: (input: ThreadStatusInput) => void;
  onEditComment?: (input: CommentEditInput) => void;
  onDeleteComment?: (input: { commentId: string; threadId: string }) => void;
  /** Show an outdated thread's version commented on beside the screen as it is now (the viewer does this itself). */
  onCompareThread?: (threadId: string) => void;
}

/** The threads a list shows: `open`, `resolved` or every one. */
export const THREAD_FILTERS = ['open', 'resolved', 'all'] as const;
export type ThreadFilter = (typeof THREAD_FILTERS)[number];
export const THREAD_FILTER_LABELS: Record<ThreadFilter, string> = { open: 'Open', resolved: 'Resolved', all: 'All' };

export function matchesThreadFilter(thread: Pick<ReviewThreadView, 'status'>, filter: ThreadFilter): boolean {
  return filter === 'all' || thread.status === filter;
}

export function openThreadCount(threads: readonly Pick<ReviewThreadView, 'status'>[] | null | undefined): number {
  return threads?.filter((t) => t.status === 'open').length ?? 0;
}

/** Threads in number order, open ones before resolved ones. */
export function sortThreads<T extends Pick<ReviewThreadView, 'number' | 'status'>>(threads: readonly T[]): T[] {
  return [...threads].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || a.number - b.number);
}

/** The thread's opening comment: what a pin's preview and a list row show. */
export function openingComment(thread: Pick<ReviewThreadView, 'comments'>): ReviewCommentView | null {
  return thread.comments.find((c) => c.kind === 'comment') ?? null;
}

/** The comments that are replies: every comment after the opening one. */
export function replies(thread: Pick<ReviewThreadView, 'comments'>): ReviewCommentView[] {
  const first = openingComment(thread);
  return thread.comments.filter((c) => c.kind === 'comment' && c !== first);
}
