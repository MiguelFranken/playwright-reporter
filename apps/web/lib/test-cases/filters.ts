/**
 * The case list's URL: which search params filter it, and how. The list page
 * reads them to query, and the case page reads the same ones (carried along
 * on the link) to step to the previous and next case of that list.
 */
import {
  CASE_AUTOMATIONS,
  CASE_PRIORITIES,
  CASE_SORTS,
  CASE_STATUSES,
  CASE_TYPES,
  CASE_VERDICTS,
  type CaseSort,
} from '@miguelfranken/ui/lib/test-cases';
import type { CaseFilters } from '@/lib/db/queries/test-cases';
import { isUuid, parsePage } from '@/lib/db/queries/shared';

type SearchParams = Record<string, string | string[] | undefined>;

/** The params that shape the list; anything else (a dialog flag) is not carried to a case. */
export const LIST_PARAMS = ['suite', 'q', 'status', 'priority', 'type', 'automation', 'verdict', 'tag', 'attention', 'unverified', 'sort', 'dir'] as const;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(values: readonly T[], v: string | string[] | undefined): T[] | undefined {
  const all = (Array.isArray(v) ? v : v ? [v] : []).filter((x): x is T => (values as readonly string[]).includes(x));
  return all.length ? all : undefined;
}

export function parseCaseFilters(sp: SearchParams): CaseFilters & { sort: CaseSort; dir: 'asc' | 'desc' } {
  const suite = first(sp.suite);
  const sortParam = first(sp.sort);
  const tag = first(sp.tag);
  return {
    suite: suite === 'unassigned' || (suite && isUuid(suite)) ? suite : undefined,
    q: first(sp.q)?.slice(0, 200) || undefined,
    status: oneOf(CASE_STATUSES, sp.status),
    priority: oneOf(CASE_PRIORITIES, sp.priority),
    type: oneOf(CASE_TYPES, sp.type),
    automation: oneOf(CASE_AUTOMATIONS, sp.automation),
    verdict: oneOf(CASE_VERDICTS, sp.verdict),
    tags: tag ? [tag] : undefined,
    attention: first(sp.attention) === '1' || undefined,
    unverified: first(sp.unverified) === '1' || undefined,
    sort: (CASE_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as CaseSort) : 'position',
    dir: first(sp.dir) === 'desc' ? 'desc' : 'asc',
    page: parsePage(first(sp.page)),
  };
}

/** The list's own params as a query string (with its `?`), to carry onto a case link. */
export function listQuery(sp: SearchParams): string {
  const out = new URLSearchParams();
  for (const key of LIST_PARAMS) {
    const v = sp[key];
    for (const value of Array.isArray(v) ? v : v ? [v] : []) out.append(key, value);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}
