/**
 * Turns the human references tools accept ("#128", "latest", a pasted URL, a
 * title fragment) into rows of the resolved project. Everything here runs
 * after `ctx.project()`, so it only ever sees ids of a project the caller may
 * read, and every lookup is scoped to that project.
 */
import {
  findLatestRun,
  findTestCandidates,
  getResultInRun,
  getResultLocation,
  getRunById,
  getRunByNumberWithCounts,
  getTestById,
  type McpRun,
  type TestCandidate,
} from '@/lib/db/queries/mcp';
import type { ResolvedProject } from './context';
import { ToolError, invalid, notFound } from './errors';
import { isUuid, parseAppUrl, parseRunRef } from './params';

function sameProject(project: ResolvedProject, url: { teamSlug: string; projectSlug: string }) {
  return url.teamSlug === project.team.slug && url.projectSlug === project.project.slug;
}

export async function resolveRun(
  project: ResolvedProject,
  ref: number | string | undefined,
  scope: { branch?: string; environment?: string } = {},
): Promise<McpRun> {
  const parsed = parseRunRef(ref ?? 'latest');
  let run: McpRun | null = null;
  switch (parsed.kind) {
    case 'number':
      run = await getRunByNumberWithCounts(project.project.id, parsed.number);
      break;
    case 'id':
      run = await getRunById(project.project.id, parsed.id);
      break;
    case 'url':
      if (!sameProject(project, parsed.url)) throw invalid(`That run URL belongs to ${parsed.url.teamSlug}/${parsed.url.projectSlug}, not ${project.ref}. Pass it as "project" too.`);
      run = await getRunByNumberWithCounts(project.project.id, parsed.url.runNumber);
      break;
    case 'latest':
      run = await findLatestRun(project.project.id, { ...scope, failedOnly: parsed.failedOnly });
      break;
  }
  if (run) return run;
  const latest = await findLatestRun(project.project.id);
  const scoped = [scope.branch && `on ${scope.branch}`, scope.environment && `in ${scope.environment}`].filter(Boolean).join(' ');
  throw notFound(
    parsed.kind === 'latest'
      ? `No ${parsed.failedOnly ? 'failed ' : ''}run ${scoped ? `${scoped} ` : ''}in ${project.ref}.`
      : `Run ${typeof ref === 'number' ? `#${ref}` : ref} not found in ${project.ref}.`,
    latest ? `The latest run in ${project.ref} is #${latest.number}. Call list_runs to browse.` : `${project.ref} has no runs yet.`,
  );
}

export interface ResolvedTest {
  id: string;
  title: string;
  titlePath: string[];
  file: string;
  pwProject: string;
}

/**
 * A test by id, URL or title. When several tests match, the ones that differ
 * only by browser project are collapsed onto the one failing in the scoped
 * run; anything else ambiguous comes back as a list to choose from.
 */
export async function resolveTest(
  project: ResolvedProject,
  ref: string,
  opts: { file?: string; browser?: string; runId?: string } = {},
): Promise<ResolvedTest> {
  const value = ref.trim();
  if (!value) throw invalid('"test" is empty.');

  let testId: string | null = null;
  if (isUuid(value)) testId = value.toLowerCase();
  const url = parseAppUrl(value);
  if (url) {
    if (!sameProject(project, url)) throw invalid(`That URL belongs to ${url.teamSlug}/${url.projectSlug}, not ${project.ref}.`);
    if (url.testId) testId = url.testId;
    else if (url.resultId) testId = (await getResultLocation(project.project.id, url.resultId))?.testId ?? null;
    else throw invalid('That URL does not point at a test or a result.');
  }
  if (testId) {
    const test = await getTestById(project.project.id, testId);
    if (!test) throw notFound(`Test ${value} not found in ${project.ref}.`, 'Call find_tests to search by title.');
    return test;
  }

  const candidates = await findTestCandidates(project.project.id, { q: value, ...opts });
  if (candidates.length === 0) {
    throw notFound(
      `No test matching "${value}"${opts.file ? ` in files matching "${opts.file}"` : ''}${opts.runId ? ' in that run' : ''} in ${project.ref}.`,
      'Call find_tests with "search" to look it up.',
    );
  }
  const pick = choose(candidates, value);
  if (pick) return pick;
  throw new ToolError(
    'AMBIGUOUS',
    `${candidates.length > 10 ? 'More than 10' : candidates.length} tests match "${value}".`,
    'Pass "test" as one of the ids below, or add "file" / "browser" to narrow it down.',
    {
      candidates: candidates.slice(0, 10).map((c) => ({
        id: c.id,
        title: c.titlePath.join(' › ') || c.title,
        file: c.file,
        browser: c.pwProject,
        outcomeInRun: c.outcomeInRun,
      })),
    },
  );
}

function choose(candidates: TestCandidate[], query: string): TestCandidate | null {
  if (candidates.length === 1) return candidates[0];
  // An exact title match beats partial ones.
  const exact = candidates.filter((c) => c.title.toLowerCase() === query.toLowerCase() || c.titlePath.join(' › ').toLowerCase() === query.toLowerCase());
  const pool = exact.length ? exact : candidates;
  if (pool.length === 1) return pool[0];
  // Same test in several browser projects: take the one that failed in the run, else the latest seen.
  const sameTest = pool.every((c) => c.file === pool[0].file && c.title === pool[0].title);
  if (sameTest && pool.length <= 10) {
    return pool.find((c) => c.outcomeInRun && ['failed', 'timedout', 'interrupted', 'flaky'].includes(c.outcomeInRun)) ?? pool[0];
  }
  return null;
}

/** A result by id or URL, or by run + test. Returns the run number the detail query needs. */
export async function resolveResult(
  project: ResolvedProject,
  input: { result?: string; run?: number | string; test?: string; file?: string; browser?: string; branch?: string; environment?: string },
): Promise<{ resultId: string; runNumber: number; testId: string }> {
  if (input.result) {
    const value = input.result.trim();
    const url = parseAppUrl(value);
    const id = url?.resultId ?? (isUuid(value) ? value.toLowerCase() : null);
    if (url && !sameProject(project, url)) throw invalid(`That URL belongs to ${url.teamSlug}/${url.projectSlug}, not ${project.ref}.`);
    if (!id) throw invalid(`"${input.result}" is not a result id or result URL.`);
    const found = await getResultLocation(project.project.id, id);
    if (!found) throw notFound(`Result ${id} not found in ${project.ref}.`, 'Call list_run_results to find results of a run.');
    return found;
  }
  if (!input.test) throw invalid('Pass "result", or "test" (with "run" to pick the run; default: the latest run).');
  const run = await resolveRun(project, input.run, { branch: input.branch, environment: input.environment });
  const test = await resolveTest(project, input.test, { file: input.file, browser: input.browser, runId: run.id });
  const resultId = await getResultInRun(run.id, test.id);
  if (!resultId) throw notFound(`"${test.title}" did not run in #${run.number}.`, 'Call get_test_history to see where it ran.');
  return { resultId, runNumber: run.number, testId: test.id };
}
