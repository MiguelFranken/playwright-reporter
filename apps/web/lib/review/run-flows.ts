/**
 * A run's review as its storyboard shows it: the page renders it on the
 * server into the query the storyboard reads (`runReviewQuery`), and the RPC
 * procedure answers the same query when the browser asks again.
 */
import { compareRuleRun, isRunCompareRule, type CompareRule, type ReviewFlowView } from '@miguelfranken/ui/lib/review';
import { projectHrefs } from '@/lib/view-models';
import { compareEachWith } from './diff/compare';
import { identityKey } from './diff/lookup';
import { runCapturesByScreen, type ComparedCapture, type ReviewFlowRecord } from './queries';
import { caseHref, toFlowViews, type CaseLinks } from './view-model';

export interface RunReviewData {
  flows: ReviewFlowView[];
}

export function toRunReviewData(records: readonly ReviewFlowRecord[], byTest: CaseLinks['byTest'], base: string, runNumber: number): RunReviewData {
  const hrefs = projectHrefs(base);
  return { flows: toFlowViews(records, (resultId) => hrefs.result(runNumber, resultId), { byTest, href: caseHref(hrefs) }) };
}

/** The reference a screen is compared with when nobody chose one: the approved baseline, else the run before. */
const defaultReferenceId = (c: ComparedCapture) => c.baseline?.capture?.id ?? c.previous?.capture.id ?? null;

/**
 * The whole review compared with what the reviewer chose (`?against=`):
 * every screen with the run before it (`previous`) or with the same screen in
 * run n (`run:<n>`), measured like a library comparison. A screen the chosen
 * run did not capture, or whose pick is its default reference anyway, keeps
 * the comparison it has. The other rules pick per image, in the viewer.
 */
export async function compareRunReview(projectId: string, records: readonly ReviewFlowRecord[], data: RunReviewData, rule: CompareRule): Promise<RunReviewData> {
  if (!isRunCompareRule(rule)) return data;
  const run = compareRuleRun(rule);
  const other = run !== null ? await runCapturesByScreen(projectId, run) : null;
  if (run !== null && !other) return data;
  const flows = await compareEachWith(data.flows, records, (mine) => {
    const picked = other
      ? (() => {
          const capture = other.captures.get(identityKey(mine));
          return capture && capture.runId !== mine.runId ? { capture, runNumber: other.runNumber } : null;
        })()
      : mine.previous
        ? { capture: mine.previous.capture, runNumber: mine.previous.runNumber }
        : null;
    if (!picked || picked.capture.id === defaultReferenceId(mine)) return null;
    return { capture: picked.capture, runNumber: picked.runNumber, label: `Run #${picked.runNumber}` };
  });
  return { flows };
}
