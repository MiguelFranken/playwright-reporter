import type { PullRequestHeaderData } from '../views/pull-requests/pull-request-header';
import type { PullRequestListRow } from '../views/pull-requests/pull-requests-table';
import { ago } from './now';

export const pullRequestList: PullRequestListRow[] = [
  {
    number: 1524,
    title: 'Stop shared caching of route-prefilled forms and fix stale webapp E2E tests',
    url: 'https://gitlab.example/mop/ecma/ms_frontend/-/merge_requests/1524',
    branch: 'fix/e2e-stage-run-19-failures',
    environment: 'feature-fix-e2e-stage-run-19-failures',
    lastAuthor: 'Ada Lovelace',
    runs: 6,
    lastRunAt: ago(24),
    lastRunNumber: 482,
    lastStatus: 'running',
    recentStatuses: ['running', 'failed', 'failed', 'passed', 'failed', 'failed'],
    avgDurationMs: 612_000,
    passRate: 0.2,
  },
  {
    number: 318,
    title: 'feat(checkout): keep the guest cart when signing in',
    url: 'https://github.com/acme/shop/pull/318',
    branch: 'feature/checkout-guest-cart',
    environment: 'staging',
    lastAuthor: 'Grace Hopper',
    runs: 14,
    lastRunAt: ago(184),
    lastRunNumber: 481,
    lastStatus: 'passed',
    recentStatuses: ['passed', 'passed', 'failed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed'],
    avgDurationMs: 252_000,
    passRate: 0.929,
  },
  {
    // An older reporter: a number, no title, no link.
    number: 77,
    title: null,
    url: null,
    branch: null,
    environment: null,
    lastAuthor: null,
    runs: 1,
    lastRunAt: ago(2_900),
    lastRunNumber: 470,
    lastStatus: 'incomplete',
    recentStatuses: ['incomplete'],
    avgDurationMs: null,
    passRate: 0,
  },
];

export const pullRequestHeader: PullRequestHeaderData = {
  number: 1524,
  title: 'Stop shared caching of route-prefilled forms and fix stale webapp E2E tests',
  url: 'https://gitlab.example/mop/ecma/ms_frontend/-/merge_requests/1524',
  branch: 'fix/e2e-stage-run-19-failures',
  runs: 6,
  firstRunAt: ago(60 * 5),
  lastRunAt: ago(24),
  lastRunNumber: 482,
  lastStatus: 'failed',
  environment: 'feature-fix-e2e-stage-run-19-failures',
  lastMessage: 'test(e2e): accept the serialized empty hotel select in FF-22\n\nThe select posts an empty string.',
  lastAuthor: 'Ada Lovelace',
};

/** No title, link, branch, message or author: what an older reporter leaves. */
export const sparsePullRequestHeader: PullRequestHeaderData = {
  number: 77,
  title: null,
  url: null,
  branch: null,
  runs: 1,
  firstRunAt: ago(2_900),
  lastRunAt: ago(2_900),
  lastRunNumber: 470,
  lastStatus: 'incomplete',
  environment: null,
  lastMessage: null,
  lastAuthor: null,
};
