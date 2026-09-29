/**
 * The library's vocabulary: the branches and pull requests kept as visual
 * documentation, and which run of each is shown. Read by the app's queries,
 * its URL parsing and the MCP tools, so it carries no JSX and no directive.
 */
import type { ReviewCounts } from './review';

/** A line of work the library can show: a branch, or a pull (merge) request. */
export type LibraryRefKey = { kind: 'branch'; branch: string } | { kind: 'pull_request'; prNumber: number };

/** `branch:main`, `pr:128`: the reference in a URL (`?ref=`). */
export function libraryRefParam(key: LibraryRefKey): string {
  return key.kind === 'branch' ? `branch:${key.branch}` : `pr:${key.prNumber}`;
}

/** The reference a `?ref=` names, or `null` when it names none. */
export function parseLibraryRef(value: string | null | undefined): LibraryRefKey | null {
  if (!value) return null;
  const pr = /^pr:(\d{1,9})$/.exec(value);
  if (pr) return { kind: 'pull_request', prNumber: Number(pr[1]) };
  if (value.startsWith('branch:') && value.length > 'branch:'.length && value.length <= 512) return { kind: 'branch', branch: value.slice('branch:'.length) };
  return null;
}

export const sameLibraryRef = (a: LibraryRefKey, b: LibraryRefKey) => libraryRefParam(a) === libraryRefParam(b);

/** A run a reference can show, as the pickers list it. */
export interface LibraryRunView {
  number: number;
  status: string;
  startedAt: string;
  commit: string | null;
  commitMessage: string | null;
}

/** A reference as the library lists it. */
export interface LibraryReferenceView {
  key: LibraryRefKey;
  /** `false` for the default branch when nobody kept it explicitly: it is always there. */
  kept: boolean;
  isDefault: boolean;
  /** A reader's name for it ("Checkout redesign"); the branch or request otherwise. */
  title: string | null;
  description: string | null;
  /** The pull request's own title, from its runs. */
  prTitle?: string | null;
  prUrl?: string | null;
  /** The branch a pull request's runs came from. */
  headBranch?: string | null;
  /** The run pinned as the reference version; `null` follows the newest. */
  pinnedRun: LibraryRunView | null;
  /** The newest run with review checkpoints. */
  latestRun: LibraryRunView | null;
  /** The newest run's review counts: what a developer still has to look at. */
  latestCounts?: ReviewCounts | null;
}

/** What the reference is called: its own title, the request's, or the branch. */
export function libraryRefLabel(ref: Pick<LibraryReferenceView, 'key' | 'title' | 'prTitle'>): string {
  if (ref.title) return ref.title;
  if (ref.key.kind === 'branch') return ref.key.branch;
  return ref.prTitle ? `#${ref.key.prNumber} ${ref.prTitle}` : `Pull request #${ref.key.prNumber}`;
}

/** `main`, `#128`: the reference as a developer names it. */
export function libraryRefShort(key: LibraryRefKey): string {
  return key.kind === 'branch' ? key.branch : `#${key.prNumber}`;
}

/** The run the reference shows now, if any. */
export const shownRun = (ref: Pick<LibraryReferenceView, 'pinnedRun' | 'latestRun'>) => ref.pinnedRun ?? ref.latestRun;

/**
 * A change to a reference. `keep: false` takes it out of the library;
 * `pin: 'latest'` follows the newest run again; `isDefault` makes it what the
 * library opens on.
 */
export interface LibraryReferencePatch {
  keep?: boolean;
  pin?: number | 'latest';
  isDefault?: boolean;
  title?: string | null;
  description?: string | null;
}

export const LIBRARY_TITLE_MAX = 120;
export const LIBRARY_DESCRIPTION_MAX = 1000;
