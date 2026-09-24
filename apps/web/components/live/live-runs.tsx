'use client';

import { ActiveRuns, type ActiveRun } from '@miguelfranken/ui/views/runs/active-runs';
import { RunsTable, type RunListItem } from '@miguelfranken/ui/views/runs/runs-table';
import { reduceRunCounts } from '@/lib/live/reducers';
import { projectHrefs } from '@/lib/view-models';
import { useLivePart } from './live-store';

/**
 * The runs list with each run's counts following the project stream. A run
 * starting or finishing changes which rows exist and is left to the (rare,
 * throttled) route refresh of the project's `LiveConnection`.
 */
export function LiveRunsTable({ base, runs, cursor }: { base: string; runs: RunListItem[]; cursor: number }) {
  const live = useLivePart('runs-table', runs, cursor, reduceRunCounts);
  return <RunsTable hrefs={projectHrefs(base)} runs={live} />;
}

export function LiveActiveRuns({ base, runs, cursor }: { base: string; runs: ActiveRun[]; cursor: number }) {
  const live = useLivePart('active-runs', runs, cursor, reduceRunCounts);
  return <ActiveRuns hrefs={projectHrefs(base)} runs={live} />;
}
