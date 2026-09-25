type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The query string as a stable key: the same results give the same key,
 * whatever order the params were written in. `omit` names params that do not
 * change the results.
 */
export function searchKey(sp: SearchParams, omit: readonly string[] = []) {
  return JSON.stringify(
    Object.entries(sp)
      .filter(([k, v]) => v !== undefined && !omit.includes(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}
