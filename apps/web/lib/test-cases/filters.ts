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

/** A query string as the record the parser takes, with repeated params as arrays. */
export function searchRecord(query: string): SearchParams {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

export { caseListKey, LIST_PARAMS, listQuery } from './list-params';

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
  const tags = (Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : []).filter(Boolean).slice(0, 50);
  return {
    suite: suite === 'unassigned' || (suite && isUuid(suite)) ? suite : undefined,
    q: first(sp.q)?.slice(0, 200) || undefined,
    status: oneOf(CASE_STATUSES, sp.status),
    priority: oneOf(CASE_PRIORITIES, sp.priority),
    type: oneOf(CASE_TYPES, sp.type),
    automation: oneOf(CASE_AUTOMATIONS, sp.automation),
    verdict: oneOf(CASE_VERDICTS, sp.verdict),
    tags: tags.length ? tags : undefined,
    attention: first(sp.attention) === '1' || undefined,
    unverified: first(sp.unverified) === '1' || undefined,
    sort: (CASE_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as CaseSort) : 'position',
    dir: first(sp.dir) === 'desc' ? 'desc' : 'asc',
    page: parsePage(first(sp.page)),
  };
}
