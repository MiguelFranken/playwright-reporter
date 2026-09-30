/**
 * The case list's params, without the parsing — safe for the browser, which
 * keys its cache of case lists on them (`caseListQuery`).
 */
export const LIST_PARAMS = ['suite', 'q', 'status', 'priority', 'type', 'automation', 'verdict', 'tag', 'attention', 'unverified', 'sort', 'dir'] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function entries(sp: SearchParams | URLSearchParams): [string, string][] {
  if (sp instanceof URLSearchParams) return [...sp];
  return Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v : v ? [v] : []).map((x): [string, string] => [k, x]));
}

/** The list's own params as a query string (with its `?`), to carry onto a case link. */
export function listQuery(sp: SearchParams | URLSearchParams): string {
  const all = entries(sp);
  const out = new URLSearchParams();
  for (const key of LIST_PARAMS) for (const [k, v] of all) if (k === key && v) out.append(k, v);
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Everything that selects which cases a list shows — its params and the page
 * — in one canonical order, so the same list is the same cache entry however
 * its URL was written (`priority=high&priority=critical` or the reverse).
 */
export function caseListKey(sp: SearchParams | URLSearchParams): string {
  const keep = new Set<string>([...LIST_PARAMS, 'page']);
  return entries(sp)
    .filter(([k, v]) => keep.has(k) && v && !(k === 'page' && v === '1'))
    .map(([k, v]) => new URLSearchParams([[k, v]]).toString())
    .sort()
    .join('&');
}
