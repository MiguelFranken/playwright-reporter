/**
 * The run page's tab vocabulary.
 *
 * It lives here rather than beside `RunTabs` because that component is a client
 * module: a value exported across a `'use client'` boundary reaches a server
 * component as a client reference, not as the array itself, so `RUN_TABS.includes`
 * would be undefined wherever a server component parses the tab out of a URL.
 * Plain data belongs on the server side of the boundary.
 */
export const RUN_TABS = ['summary', 'specs', 'errors', 'config'] as const;
export type RunTab = (typeof RUN_TABS)[number];

export const RUN_TAB_LABELS: Record<RunTab, string> = {
  summary: 'Summary',
  specs: 'Specs',
  errors: 'Errors',
  config: 'Configuration',
};
