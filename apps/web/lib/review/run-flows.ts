/**
 * A run's review as its storyboard shows it: the page renders it on the
 * server into the query the storyboard reads (`runReviewQuery`), and the RPC
 * procedure answers the same query when the browser asks again.
 */
import { compareRuleRun, isRunCompareRule, statusAgainstRun, type CompareRule, type ReviewFlowView, type ReviewStatus } from '@miguelfranken/ui/lib/review';
import { projectHrefs } from '@/lib/view-models';
import { measureEach, type MeasuredReference } from './diff/compare';
import { identityKey } from './diff/lookup';
import { runCapturesByScreen, type CaptureRecord, type ReviewFlowRecord } from './queries';
import { caseHref, pendingDiff, toDiffView, toFlowViews, toReviewImage, type CaseLinks } from './view-model';

export interface RunReviewData {
  flows: ReviewFlowView[];
}

export function toRunReviewData(records: readonly ReviewFlowRecord[], byTest: CaseLinks['byTest'], base: string, runNumber: number): RunReviewData {
  const hrefs = projectHrefs(base);
  return { flows: toFlowViews(records, (resultId) => hrefs.result(runNumber, resultId), { byTest, href: caseHref(hrefs) }) };
}

/** One image of a run compared with the run a reviewer (or an agent) chose. */
export interface RunComparisonEntry {
  /** The same screen in the chosen run; `null` when that run did not capture it. */
  reference: { capture: CaptureRecord; runNumber: number } | null;
  /** Did the screen change since that run (`statusAgainstRun`): the approved baseline plays no part. */
  status: ReviewStatus;
  /** Measured against the reference, when it differs and the comparison is known. */
  measured: MeasuredReference | null;
}

/**
 * A run's images compared with the run before (`previous`: per screen, the
 * newest earlier run that captured it) or with run n (`run:<n>`): the
 * reference, the status against it and the measured difference, per capture
 * id. `null` for any other rule, or a run that does not exist. The storyboard
 * (`compareRunReview`), the MCP tools and the REST API read this one answer.
 */
export async function compareRunRecords(projectId: string, records: readonly ReviewFlowRecord[], rule: CompareRule): Promise<{ runNumber: number | null; entries: Map<string, RunComparisonEntry> } | null> {
  if (!isRunCompareRule(rule)) return null;
  const run = compareRuleRun(rule);
  const other = run !== null ? await runCapturesByScreen(projectId, run) : null;
  if (run !== null && !other) return null;
  const mine = records.flatMap((r) => r.checkpoints.flatMap((cp) => cp.captures));
  const references = new Map<string, RunComparisonEntry['reference']>();
  for (const c of mine) {
    if (other) {
      const capture = other.captures.get(identityKey(c));
      references.set(c.id, capture && capture.runId !== c.runId ? { capture, runNumber: other.runNumber } : null);
    } else references.set(c.id, c.previous ? { capture: c.previous.capture, runNumber: c.previous.runNumber } : null);
  }
  const measured = await measureEach(mine, (c) => {
    const picked = references.get(c.id);
    return picked ? { capture: picked.capture, runNumber: picked.runNumber, label: `Run #${picked.runNumber}` } : null;
  });
  const entries = new Map<string, RunComparisonEntry>();
  for (const c of mine) {
    const reference = references.get(c.id) ?? null;
    entries.set(c.id, { reference, status: statusAgainstRun({ decision: c.decision?.decision, sha256: c.sha256, reference: reference?.capture }), measured: measured.get(c.id) ?? null });
  }
  return { runNumber: other?.runNumber ?? null, entries };
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
  const compared = await compareRunRecords(projectId, records, rule);
  if (!compared) return data;
  return {
    flows: data.flows.map((f) => ({
      ...f,
      checkpoints: f.checkpoints.map((cp) => ({
        ...cp,
        captures: cp.captures.map((view) => {
          const e = compared.entries.get(view.id);
          if (!e) return view;
          const m = e.measured;
          return {
            ...view,
            status: e.status,
            ...(m
              ? {
                  compare: { captureId: m.capture.id, image: toReviewImage(m.capture), label: m.label, same: m.same, ...(m.runNumber ? { runNumber: m.runNumber } : {}) },
                  diff: m.diff ? toDiffView(m.diff, 'compare') : m.pending ? pendingDiff('compare') : null,
                }
              : {}),
          };
        }),
      })),
    })),
  };
}
