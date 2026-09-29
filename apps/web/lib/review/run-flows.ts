/**
 * A run's review as its storyboard shows it: the page renders it on the
 * server into the query the storyboard reads (`runReviewQuery`), and the RPC
 * procedure answers the same query when the browser asks again.
 */
import type { ReviewFlowView } from '@miguelfranken/ui/lib/review';
import { projectHrefs } from '@/lib/view-models';
import type { ReviewFlowRecord } from './queries';
import { caseHref, toFlowViews, type CaseLinks } from './view-model';

export interface RunReviewData {
  flows: ReviewFlowView[];
}

export function toRunReviewData(records: readonly ReviewFlowRecord[], byTest: CaseLinks['byTest'], base: string, runNumber: number): RunReviewData {
  const hrefs = projectHrefs(base);
  return { flows: toFlowViews(records, (resultId) => hrefs.result(runNumber, resultId), { byTest, href: caseHref(hrefs) }) };
}
