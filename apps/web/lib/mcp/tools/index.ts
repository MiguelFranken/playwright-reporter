import type { ToolDef } from '../registry';
import { checkFlakiness } from './check-flakiness';
import { compareRuns } from './compare-runs';
import { findTests } from './find-tests';
import { getArtifact } from './get-artifact';
import { getFailureContext } from './get-failure-context';
import { getRerunCommand } from './get-rerun-command';
import { getResult } from './get-result';
import { getRun } from './get-run';
import { getTestHistory } from './get-test-history';
import { listFilters } from './list-filters';
import { listRunResults } from './list-run-results';
import { listRuns } from './list-runs';
import { projectHealth } from './project-health';
import { summarizeFailures } from './summarize-failures';
import { verifyFixTool } from './verify-fix';
import { whoami } from './whoami';
import { TEST_CASE_TOOLS } from './test-cases';
import { REVIEW_TOOLS } from './review';
import { REVIEW_THREAD_TOOLS } from './review-threads';
import { LIBRARY_TOOLS } from './library';
import { FEEDBACK_TOOLS } from './feedback';
import { VISUAL_DIFF_TOOLS } from './visual-diffs';
import { VISUAL_IGNORE_TOOLS } from './visual-ignore';

/** Every tool, in the order clients list them: find things first, then explain and verify. */
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
  getFailureContext,
  checkFlakiness,
  summarizeFailures,
  compareRuns,
  verifyFixTool,
  getArtifact,
  getRerunCommand,
  ...TEST_CASE_TOOLS,
  ...FEEDBACK_TOOLS,
  ...REVIEW_TOOLS,
  ...REVIEW_THREAD_TOOLS,
  ...VISUAL_DIFF_TOOLS,
  ...VISUAL_IGNORE_TOOLS,
  ...LIBRARY_TOOLS,
] as unknown as ToolDef[];
