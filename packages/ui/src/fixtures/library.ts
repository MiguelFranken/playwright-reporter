import type { LibraryReferenceView, LibraryRunView } from '../lib/library';
import { ago } from './now';

const run = (number: number, minutesAgo: number, commitMessage: string, status = 'passed'): LibraryRunView => ({
  number,
  status,
  startedAt: ago(minutesAgo).toISOString(),
  commit: number.toString(16).padStart(7, 'a'),
  commitMessage,
});

export const mainRuns: LibraryRunView[] = [run(481, 60 * 5, 'Merge pull request #207'), run(476, 60 * 30, 'Merge pull request #205'), run(470, 60 * 50, 'Release 2.4')];

/** The default branch, never kept explicitly: always in the library. */
export const mainReference: LibraryReferenceView = {
  key: { kind: 'branch', branch: 'main' },
  kept: false,
  isDefault: true,
  title: null,
  description: null,
  pinnedRun: null,
  latestRun: mainRuns[0],
  latestCounts: { approved: 45, changed: 0, new: 0, changes_requested: 0, unchanged: 0 },
};

export const releaseReference: LibraryReferenceView = {
  key: { kind: 'branch', branch: 'release/2.4' },
  kept: true,
  isDefault: false,
  title: 'Live shop (2.4)',
  description: 'What customers see today: the release deployed to production.',
  pinnedRun: run(470, 60 * 50, 'Release 2.4'),
  latestRun: run(474, 60 * 40, 'Fix the footer links'),
  latestCounts: { approved: 44, changed: 1, new: 0, changes_requested: 0, unchanged: 0 },
};

/** A long-lived pull request kept as documentation while it is open. */
export const redesignReference: LibraryReferenceView = {
  key: { kind: 'pull_request', prNumber: 212 },
  kept: true,
  isDefault: false,
  title: null,
  description: 'The new checkout: summary in a sidebar, coupons inline. Open until the pilot ends.',
  prTitle: 'Checkout redesign',
  prUrl: 'https://github.com/acme/shop/pull/212',
  headBranch: 'feat/checkout-redesign',
  pinnedRun: null,
  latestRun: run(483, 12, 'Redesign the checkout summary'),
  latestCounts: { approved: 38, changed: 4, new: 3, changes_requested: 0, unchanged: 0 },
};

/** A pull request nobody kept: browsable, not listed. */
export const unkeptReference: LibraryReferenceView = {
  key: { kind: 'pull_request', prNumber: 209 },
  kept: false,
  isDefault: false,
  title: null,
  description: null,
  prTitle: 'Round coupons to cents',
  headBranch: 'fix/coupon-rounding',
  pinnedRun: null,
  latestRun: run(482, 95, 'Round fixed-value coupons to cents', 'failed'),
  latestCounts: { approved: 40, changed: 0, new: 2, changes_requested: 1, unchanged: 0 },
};

export const libraryReferences: LibraryReferenceView[] = [mainReference, releaseReference, redesignReference];

export const redesignRuns: LibraryRunView[] = [run(483, 12, 'Redesign the checkout summary'), run(480, 200, 'Move the summary into a sidebar')];

export const libraryCandidates = {
  branches: ['main', 'release/2.4', 'feat/checkout-redesign', 'fix/coupon-rounding', 'chore/deps'],
  pullRequests: [
    { number: 212, title: 'Checkout redesign' },
    { number: 209, title: 'Round coupons to cents' },
    { number: 205, title: null },
  ],
};
