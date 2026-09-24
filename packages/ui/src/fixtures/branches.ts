import type { BranchHeaderData } from '../views/branches/branch-header';
import type { BranchListRow } from '../views/branches/branches-table';
import { ago } from './now';

export const branchList: BranchListRow[] = [
  {
    branch: 'main',
    environment: 'production',
    runs: 184,
    lastRunAt: ago(38),
    lastRunNumber: 482,
    lastStatus: 'passed',
    recentStatuses: ['passed', 'passed', 'passed', 'failed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed'],
    avgDurationMs: 252_000,
    passRate: 0.984,
  },
  {
    branch: 'develop',
    environment: 'staging',
    runs: 96,
    lastRunAt: ago(212),
    lastRunNumber: 476,
    lastStatus: 'failed',
    recentStatuses: ['failed', 'passed', 'failed', 'passed', 'passed', 'interrupted', 'passed', 'passed', 'failed', 'passed'],
    avgDurationMs: 318_400,
    passRate: 0.812,
  },
  {
    branch: 'feature/checkout-guest-cart',
    environment: 'staging',
    runs: 4,
    lastRunAt: ago(184),
    lastRunNumber: 481,
    lastStatus: 'running',
    recentStatuses: ['running', 'failed', 'failed', 'passed'],
    avgDurationMs: 190_000,
    passRate: 0.333,
  },
  {
    branch: 'release/2026-09-18-hotfix-checkout-guest-cart-discount-restore',
    environment: null,
    runs: 1,
    lastRunAt: ago(2_900),
    lastRunNumber: 478,
    lastStatus: 'incomplete',
    recentStatuses: ['incomplete'],
    avgDurationMs: null,
    passRate: 0,
  },
  {
    branch: null,
    environment: null,
    runs: 7,
    lastRunAt: ago(4_300),
    lastRunNumber: 470,
    lastStatus: 'passed',
    recentStatuses: ['passed', 'passed', 'failed', 'passed', 'passed', 'passed', 'passed'],
    avgDurationMs: 61_000,
    passRate: 0.857,
  },
];

export const branchHeader: BranchHeaderData = {
  branch: 'feature/checkout-guest-cart',
  runs: 41,
  firstRunAt: ago(60 * 24 * 12),
  lastRunAt: ago(184),
  lastRunNumber: 481,
  lastStatus: 'failed',
  environment: 'staging',
  lastMessage: 'fix(checkout): keep the guest cart when signing in\n\nThe cart id was dropped on redirect.',
  lastAuthor: 'Ada Lovelace',
};

/** No commit message, no author, one run: everything optional left out. */
export const sparseBranchHeader: BranchHeaderData = {
  branch: 'release/2026-09-18-hotfix-checkout-guest-cart-discount-restore-with-a-very-long-name',
  runs: 1,
  firstRunAt: ago(2_900),
  lastRunAt: ago(2_900),
  lastRunNumber: 478,
  lastStatus: 'incomplete',
  environment: null,
  lastMessage: null,
  lastAuthor: null,
};
