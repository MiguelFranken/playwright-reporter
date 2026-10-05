/**
 * A run's review as its storyboard shows it: the page renders it on the
 * server into the query the storyboard reads (`runReviewQuery`), and the RPC
 * procedure answers the same query when the browser asks again.
 */
import { compareRuleRun, isRunCompareRule, statusAgainstRun, type CompareRule, type ReviewFlowView } from '@miguelfranken/ui/lib/review';
import { projectHrefs } from '@/lib/view-models';
import { compareEachWith } from './diff/compare';
import { identityKey } from './diff/lookup';
import { runCapturesByScreen, type CaptureRecord, type ComparedCapture, type ReviewFlowRecord } from './queries';
import { caseHref, toFlowViews, type CaseLinks } from './view-model';

export interface RunReviewData {
  flows: ReviewFlowView[];
}

export function toRunReviewData(records: readonly ReviewFlowRecord[], byTest: CaseLinks['byTest'], base: string, runNumber: number): RunReviewData {
  const hrefs = projectHrefs(base);
  return { flows: toFlowViews(records, (resultId) => hrefs.result(runNumber, resultId), { byTest, href: caseHref(hrefs) }) };
}

/**
 * The whole review compared with what the reviewer chose (`?against=`):
 * every screen with the run before it (`previous`) or with the same screen in
 * run n (`run:<n>`), measured like a library comparison — also where that is
 * the screen's default reference anyway, so every screen names the run it is
 * compared with. A screen the chosen run did not capture keeps the comparison
 * it has. The other rules pick per image, in the viewer.
 *
 * The statuses answer what the reviewer asked: did the screen change since
 * that run? The approved baseline plays no part (see `statusAgainstRun`).
 */
export async function compareRunReview(projectId: string, records: readonly ReviewFlowRecord[], data: RunReviewData, rule: CompareRule): Promise<RunReviewData> {
  if (!isRunCompareRule(rule)) return data;
  const run = compareRuleRun(rule);
  const other = run !== null ? await runCapturesByScreen(projectId, run) : null;
  if (run !== null && !other) return data;
  const references = new Map<string, { capture: CaptureRecord; runNumber: number } | null>();
  for (const r of records)
    for (const cp of r.checkpoints)
      for (const mine of cp.captures) {
        if (other) {
          const capture = other.captures.get(identityKey(mine));
          references.set(mine.id, capture && capture.runId !== mine.runId ? { capture, runNumber: other.runNumber } : null);
        } else references.set(mine.id, mine.previous ? { capture: mine.previous.capture, runNumber: mine.previous.runNumber } : null);
      }
  const flows = await compareEachWith(data.flows, records, (mine) => {
    const picked = references.get(mine.id);
    if (!picked) return null;
    return { capture: picked.capture, runNumber: picked.runNumber, label: `Run #${picked.runNumber}` };
  });
  return { flows: restatus(flows, records, references) };
}

/** Each image's status against the run the review is compared with. */
function restatus(flows: ReviewFlowView[], records: readonly ReviewFlowRecord[], references: ReadonlyMap<string, { capture: CaptureRecord } | null>): ReviewFlowView[] {
  const mine = new Map<string, ComparedCapture>();
  for (const r of records) for (const cp of r.checkpoints) for (const c of cp.captures) mine.set(c.id, c);
  return flows.map((f) => ({
    ...f,
    checkpoints: f.checkpoints.map((cp) => ({
      ...cp,
      captures: cp.captures.map((view) => {
        const c = mine.get(view.id);
        if (!c || !references.has(view.id)) return view;
        const status = statusAgainstRun({ decision: c.decision?.decision, sha256: c.sha256, reference: references.get(view.id)?.capture });
        return status === view.status ? view : { ...view, status };
      }),
    })),
  }));
}
