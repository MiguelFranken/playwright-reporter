/**
 * The demo's story: which branches run the suite in a given two-hour slot,
 * against which scenario, with which commit. Pure functions of the slot, so
 * the scheduled workflow (`scripts/plan.ts`) and the history backfill
 * (`scripts/backfill.ts`) tell the same story: `main` mostly green with the
 * odd regression that gets fixed a day later, and feature branches that come
 * and go, some of them broken until their last commit.
 */
import { createHash } from 'node:crypto';

export type Api = 'catalog' | 'search' | 'coupon' | 'payment' | 'login';
export type Bug = 'shipping-threshold' | 'coupon-case' | 'login-label' | 'sort-price';

export interface Scenario {
  bugs: Bug[];
  latency: Partial<Record<Api, [number, number]>>;
}

/**
 * What the app does in a run. The suite waits a second for search
 * suggestions and coupon checks, so the latencies here decide how flaky
 * those tests are: stable runs still flake now and then, as real suites do.
 */
export const SCENARIOS = {
  stable: { bugs: [], latency: { search: [100, 1250], coupon: [80, 1150] } },
  'flaky-search': { bugs: [], latency: { search: [400, 2200], coupon: [80, 1150] } },
  'slow-catalog': { bugs: [], latency: { catalog: [900, 1900], payment: [1800, 3200], search: [100, 1250] } },
  'shipping-regression': { bugs: ['shipping-threshold'], latency: { search: [100, 1250], coupon: [80, 1150] } },
  'coupon-regression': { bugs: ['coupon-case'], latency: { search: [100, 1250] } },
  'login-regression': { bugs: ['login-label'], latency: { search: [100, 1250], coupon: [80, 1150] } },
  'sort-regression': { bugs: ['sort-price'], latency: { search: [100, 1250], coupon: [80, 1150] } },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;

export function scenario(name: string | undefined): Scenario {
  return SCENARIOS[(name ?? 'stable') as ScenarioName] ?? SCENARIOS.stable;
}

export const SLOT_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FeatureBranch {
  branch: string;
  author: string;
  /** What the branch ships with; after `fixedAfterDays`, it is fixed. */
  scenario: ScenarioName;
  fixedAfterDays?: number;
  commits: string[];
}

/**
 * Every three days another branch opens, and each lives for six, so two are
 * usually in flight next to `main`.
 */
const FEATURE_BRANCHES: FeatureBranch[] = [
  {
    branch: 'feature/checkout-redesign',
    author: 'Priya Nair',
    scenario: 'shipping-regression',
    fixedAfterDays: 4,
    commits: ['Redesign the order summary', 'Move shipping into the summary', 'Fix the free shipping threshold'],
  },
  {
    branch: 'feature/search-autocomplete',
    author: 'Jonas Weber',
    scenario: 'flaky-search',
    commits: ['Suggest products while typing', 'Debounce suggestion requests', 'Highlight the matched text'],
  },
  {
    branch: 'fix/coupon-codes',
    author: 'Lea Martin',
    scenario: 'coupon-regression',
    fixedAfterDays: 2,
    commits: ['Validate coupon codes on the server', 'Accept lower-case coupon codes'],
  },
  {
    branch: 'chore/upgrade-dependencies',
    author: 'Renovate Bot',
    scenario: 'slow-catalog',
    commits: ['Update all non-major dependencies', 'Update the image CDN client'],
  },
  {
    branch: 'feature/sso-login',
    author: 'Sam Carter',
    scenario: 'login-regression',
    fixedAfterDays: 3,
    commits: ['Add single sign-on', 'Share the login form with SSO', 'Restore the email field label'],
  },
  {
    branch: 'feature/sort-by-price',
    author: 'Mia Hoffmann',
    scenario: 'sort-regression',
    fixedAfterDays: 3,
    commits: ['Sort the catalog by price', 'Fix the ascending price order'],
  },
  {
    branch: 'feature/wishlist',
    author: 'Noah Schmidt',
    scenario: 'stable',
    commits: ['Save products to a wishlist', 'Show the wishlist on the account page'],
  },
];

const MAIN_COMMITS = [
  'Show stock levels on product pages',
  'Cache the product catalog',
  'Tidy up the cart table',
  'Add rain hats to the catalog',
  'Improve checkout error messages',
  'Speed up the search index',
  'Track add-to-cart events',
  'Polish the order confirmation',
];
const MAIN_AUTHORS = ['Priya Nair', 'Jonas Weber', 'Lea Martin', 'Sam Carter', 'Mia Hoffmann'];

export interface PlannedRun {
  /** Unique within the slot; shards of one run share it. */
  id: string;
  branch: string;
  scenario: ScenarioName;
  sha: string;
  message: string;
  author: string;
  environment: 'staging' | 'preview';
  tags: string[];
  shards: number;
}

/** A number in [0, 1) that is the same wherever it is computed. */
export function chance(...parts: (string | number)[]): number {
  return createHash('sha1').update(parts.join('|')).digest().readUInt32BE(0) / 2 ** 32;
}

function sha(...parts: (string | number)[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex');
}

export function slotOf(time: Date | number): number {
  return Math.floor(new Date(time).getTime() / SLOT_MS);
}

export function slotStart(slot: number): Date {
  return new Date(slot * SLOT_MS);
}

/** `main`'s scenario: green, except for a regression every so often that stays for a day. */
function mainScenario(slot: number): ScenarioName {
  const day = Math.floor((slot * SLOT_MS) / DAY_MS);
  const cycle = day % 11;
  if (cycle === 3) return 'shipping-regression';
  if (cycle === 8 && slot % 12 >= 6) return 'coupon-regression';
  if (cycle === 6) return 'slow-catalog';
  return chance('main-flaky', slot) < 0.15 ? 'flaky-search' : 'stable';
}

export function planSlot(slot: number): PlannedRun[] {
  const hour = slotStart(slot).getUTCHours();
  const mainCommit = Math.floor(slot / 3); // a merge to main every six hours
  const runs: PlannedRun[] = [
    {
      id: 'main',
      branch: 'main',
      scenario: mainScenario(slot),
      sha: sha('main', mainCommit),
      message: MAIN_COMMITS[mainCommit % MAIN_COMMITS.length],
      author: MAIN_AUTHORS[mainCommit % MAIN_AUTHORS.length],
      environment: 'staging',
      tags: hour < 2 ? ['e2e', 'nightly'] : ['e2e'],
      shards: 2,
    },
  ];

  const day = Math.floor((slot * SLOT_MS) / DAY_MS);
  const window = Math.floor(day / 3);
  for (const opened of [window, window - 1]) {
    const feature = FEATURE_BRANCHES[((opened % FEATURE_BRANCHES.length) + FEATURE_BRANCHES.length) % FEATURE_BRANCHES.length];
    // A branch is pushed to in about half the slots, and never at night.
    if (hour < 6 || chance(feature.branch, slot) >= 0.5) continue;
    const age = day - opened * 3;
    const fixable = feature.fixedAfterDays !== undefined;
    const fixed = fixable && age >= feature.fixedAfterDays!;
    // A fixable branch's last commit is its fix, so it is only pushed once fixed.
    const last = feature.commits.length - 1;
    const commit = fixed ? last : Math.min(fixable ? last - 1 : last, Math.floor((age / 6) * feature.commits.length));
    runs.push({
      id: feature.branch.replace(/[^a-z0-9]+/gi, '-'),
      branch: feature.branch,
      scenario: fixed ? 'stable' : feature.scenario,
      sha: sha(feature.branch, opened, commit),
      message: feature.commits[commit],
      author: feature.author,
      environment: 'preview',
      tags: ['e2e', 'pull-request'],
      shards: 1,
    });
  }
  return runs;
}

/** Every slot that starts in [from, to). */
export function slotsBetween(from: Date, to: Date): number[] {
  const slots: number[] = [];
  for (let s = Math.ceil(from.getTime() / SLOT_MS); s * SLOT_MS < to.getTime(); s++) slots.push(s);
  return slots;
}

/** Minutes past the slot's start the run begins at, so runs don't all start on the hour. */
export function slotJitterMs(slot: number, id: string): number {
  return Math.floor(chance('jitter', slot, id) * 40 * 60 * 1000);
}
