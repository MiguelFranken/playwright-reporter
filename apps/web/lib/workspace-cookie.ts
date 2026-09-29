/**
 * The team and project last visited, remembered in a cookie so the chrome can
 * keep showing them off team routes (`/admin`, `/account`) even when such a
 * page is the first one loaded — a bookmark, a reload. The client writes it on
 * every team route (`useLastWorkspace`); the shell reads it once per request.
 *
 * It only chooses what the sidebar shows: the slugs are matched against the
 * teams the user may open, so a stale or forged value falls back harmlessly.
 */
export const WORKSPACE_COOKIE = 'last-workspace';

/** A year: long enough to outlive any session, refreshed on every team route. */
export const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
