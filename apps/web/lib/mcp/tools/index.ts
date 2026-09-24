import type { ToolDef } from '../registry';
import { findTests } from './find-tests';
import { getResult } from './get-result';
import { getRun } from './get-run';
import { getTestHistory } from './get-test-history';
import { listFilters } from './list-filters';
import { listRunResults } from './list-run-results';
import { listRuns } from './list-runs';
import { projectHealth } from './project-health';
import { whoami } from './whoami';

/** Every tool, in the order clients list them. */
export const TOOLS: ToolDef[] = [
  whoami,
  listFilters,
  listRuns,
  getRun,
  listRunResults,
  getResult,
  findTests,
  getTestHistory,
  projectHealth,
] as unknown as ToolDef[];
