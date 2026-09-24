import { RUN_TABS, type RunTab } from '@miguelfranken/ui/lib/run-tab';

export { RUN_TABS };
export type { RunTab };

export function parseRunTab(v: string | undefined): RunTab {
  return (RUN_TABS as readonly string[]).includes(v ?? '') ? (v as RunTab) : 'summary';
}
