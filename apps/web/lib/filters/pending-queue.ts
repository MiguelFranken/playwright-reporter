/**
 * The queue behind `components/filters/pending-search.ts`: the queries filters
 * have asked for that the router has not committed yet, oldest first.
 */
export type PendingTarget = { pathname: string; search: string };

/** Two queries are the same whatever order their params — and a repeated param's values — were written in. */
export function sameSearch(a: string, b: string) {
  const sort = (s: string) => [...new URLSearchParams(s)].map(([k, v]) => `${k}=${v}`).sort().join('&');
  return sort(a) === sort(b);
}

/**
 * What is left of the queue once the router commits `search` on `pathname`:
 * the targets after the one it reached, or none when it went somewhere no
 * target led (a link, the back button).
 */
export function settle(targets: readonly PendingTarget[], pathname: string, search: string): readonly PendingTarget[] {
  let reached = -1;
  targets.forEach((t, i) => {
    if (t.pathname === pathname && sameSearch(t.search, search)) reached = i;
  });
  return reached === -1 ? [] : targets.slice(reached + 1);
}

/** The newest query asked for on this route, if any. */
export function latest(targets: readonly PendingTarget[], pathname: string): PendingTarget | undefined {
  for (let i = targets.length - 1; i >= 0; i--) if (targets[i]!.pathname === pathname) return targets[i];
  return undefined;
}
