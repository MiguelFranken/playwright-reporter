/**
 * The explorer's sortable columns.
 *
 * Kept out of `ExplorerTable` for the same reason as `RUN_TABS`: the table is a
 * client module, and a value crossing that boundary is a client reference by the
 * time a server component (here, the query layer that validates `?sort=`) tries
 * to use it.
 */
export const EXPLORER_SORTS = ['lastRun', 'title', 'reliability', 'flakyRate', 'failureRate', 'runs', 'avgDuration'] as const;
export type ExplorerSort = (typeof EXPLORER_SORTS)[number];
export type SortDir = 'asc' | 'desc';
