/**
 * Failures sort into a handful of shapes, and which shape a failure has is the
 * first thing anyone asks of a red run: an assertion that disagrees is a
 * product bug, a timeout is usually the environment, a locator miss is usually
 * the test. The wire carries no such field, so it is derived from the message
 * — presentation, therefore here rather than in a migration.
 *
 * Order matters: the first pattern that matches wins, so the narrow causes are
 * listed before the broad ones.
 */
import { stripAnsi } from './ansi';
import type { Tone } from './tone';

export type ErrorCategoryKey =
  | 'assertion'
  | 'timeout'
  | 'locator'
  | 'network'
  | 'crash'
  | 'snapshot'
  | 'other';

export interface ErrorCategory {
  key: ErrorCategoryKey;
  label: string;
  /** Plural heading for a group of these, e.g. the errors tab. */
  groupLabel: string;
  tone: Tone;
}

const CATEGORIES: Record<ErrorCategoryKey, ErrorCategory> = {
  assertion: { key: 'assertion', label: 'Assertion', groupLabel: 'Assertion failures', tone: 'danger' },
  timeout: { key: 'timeout', label: 'Timeout', groupLabel: 'Timeouts', tone: 'warning' },
  locator: { key: 'locator', label: 'Locator', groupLabel: 'Locator failures', tone: 'warning' },
  network: { key: 'network', label: 'Network', groupLabel: 'Network failures', tone: 'info' },
  crash: { key: 'crash', label: 'Crash', groupLabel: 'Crashes', tone: 'danger' },
  snapshot: { key: 'snapshot', label: 'Snapshot', groupLabel: 'Snapshot mismatches', tone: 'warning' },
  other: { key: 'other', label: 'Other', groupLabel: 'Other failures', tone: 'neutral' },
};

const PATTERNS: [ErrorCategoryKey, RegExp][] = [
  ['snapshot', /toMatchSnapshot|toHaveScreenshot|snapshot (?:comparison|doesn't match)|screenshot comparison/i],
  ['timeout', /timeout .*exceeded|timed out|TimeoutError|waiting for .* to be (?:visible|enabled)/i],
  ['locator', /locator\.|strict mode violation|no element matches|resolved to \d+ elements|getBy\w+\(/i],
  // Chromium says `net::ERR_*`, Firefox says `NS_ERROR_*`, Node says `ECONN*`.
  ['network', /net::ERR|NS_ERROR_|ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed|socket hang up|EAI_AGAIN/i],
  ['crash', /Target (?:page|closed|crashed)|browser has been closed|Protocol error|page\.crash/i],
  ['assertion', /expect\(|AssertionError|toBe(?:Visible|Truthy|Defined|Close)?\b|toEqual|toContain|toHave\w+/i],
];

/** The category a raw error message falls into. `null`/empty reads as "other". */
export function errorCategory(message: string | null | undefined): ErrorCategory {
  const text = stripAnsi(message);
  if (!text.trim()) return CATEGORIES.other;
  for (const [key, re] of PATTERNS) if (re.test(text)) return CATEGORIES[key];
  return CATEGORIES.other;
}

export function categoryByKey(key: ErrorCategoryKey): ErrorCategory {
  return CATEGORIES[key] ?? CATEGORIES.other;
}

/** Every category in the order groups and legends should list them. */
export const ERROR_CATEGORIES: ErrorCategory[] = [
  CATEGORIES.assertion,
  CATEGORIES.timeout,
  CATEGORIES.locator,
  CATEGORIES.snapshot,
  CATEGORIES.network,
  CATEGORIES.crash,
  CATEGORIES.other,
];

/**
 * Tallies messages by category, keeping the canonical order and dropping the
 * categories nothing landed in — what an outcome card's breakdown lists.
 */
export function tallyCategories(messages: (string | null | undefined)[]): { category: ErrorCategory; count: number }[] {
  const counts = new Map<ErrorCategoryKey, number>();
  for (const m of messages) {
    const c = errorCategory(m);
    counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
  }
  return ERROR_CATEGORIES.filter((c) => counts.has(c.key)).map((category) => ({
    category,
    count: counts.get(category.key) ?? 0,
  }));
}
