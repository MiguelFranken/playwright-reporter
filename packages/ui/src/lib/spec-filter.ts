/**
 * The specs tab's sort and status vocabulary.
 *
 * It lives here rather than beside `RunSpecs` for the same reason as
 * `RUN_TABS`: that view is a client module, and a value crossing the
 * `'use client'` boundary reaches a server component as a client reference —
 * so `SPEC_SORTS.includes` would be undefined in the page that parses `?sort=`
 * out of the URL. Plain data belongs on the server side of the boundary.
 */

export const SPEC_SORTS = ['name-asc', 'name-desc', 'duration-asc', 'duration-desc'] as const;
export type SpecSort = (typeof SPEC_SORTS)[number];

export const DEFAULT_SPEC_SORT: SpecSort = 'name-asc';

/** Grouped the way the menu presents them: the measure, then its direction. */
export const SPEC_SORT_GROUPS: { label: string; options: { value: SpecSort; label: string }[] }[] = [
  {
    label: 'Sort by name',
    options: [
      { value: 'name-asc', label: 'A to Z' },
      { value: 'name-desc', label: 'Z to A' },
    ],
  },
  {
    label: 'Sort by duration',
    options: [
      { value: 'duration-asc', label: 'Low to high' },
      { value: 'duration-desc', label: 'High to low' },
    ],
  },
];

/**
 * The statuses a spec file can be filtered by — the tallies `SpecSummary`
 * actually carries. A file matches when it holds at least one test in any of
 * the selected statuses.
 */
export const SPEC_STATUSES = ['passed', 'failed', 'flaky', 'skipped', 'running'] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];

export const SPEC_STATUS_LABELS: Record<SpecStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  flaky: 'Flaky',
  skipped: 'Skipped',
  running: 'Running',
};

export interface SpecFilters {
  /** Matches the file path, case-insensitively. */
  q?: string;
  sort?: SpecSort;
  /** Empty or absent means every status. */
  status?: SpecStatus[];
}

/** A partial update of the filter state; `null` clears that key. */
export interface SpecFilterChange {
  q?: string | null;
  sort?: SpecSort | null;
  status?: SpecStatus[] | null;
}

export function parseSpecSort(value: string | undefined): SpecSort | undefined {
  return (SPEC_SORTS as readonly string[]).includes(value ?? '') ? (value as SpecSort) : undefined;
}

/** Accepts the one-or-many shape `searchParams` hands over for a repeated key. */
export function parseSpecStatuses(value: string | string[] | undefined): SpecStatus[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : value.split(',');
  const known = new Set<string>(SPEC_STATUSES);
  const out: SpecStatus[] = [];
  for (const entry of raw) {
    const v = entry.trim();
    if (known.has(v) && !out.includes(v as SpecStatus)) out.push(v as SpecStatus);
  }
  return out;
}

/** True when anything is narrowing the list — the cue for a "clear" affordance. */
export function hasSpecFilters(filters: SpecFilters): boolean {
  return Boolean(filters.q) || (filters.status?.length ?? 0) > 0 || (filters.sort ?? DEFAULT_SPEC_SORT) !== DEFAULT_SPEC_SORT;
}
