import { CheckCircle2 } from 'lucide-react';
import { EmptyState } from '../../patterns/empty-state';
import { ErrorGroupList } from './error-group-list';

/**
 * Failures in one run, grouped by error signature.
 *
 * Signatures alone are a flat list, and a flat list of twenty errors tells you
 * nothing about where to start. So signatures are sorted into *categories*
 * first — an assertion that disagrees, a timeout, a lost locator — because the
 * category decides who should look at it. Within a category the biggest blast
 * radius comes first.
 *
 * This half stays on the server and only resolves each group's links; the
 * grouping and the folding live in `ErrorGroupList`, which is a client module.
 */

export interface ErrorGroup {
  signature: string;
  message: string;
  count: number;
  failed: number;
  flaky: number;
  files: string[];
  sampleResultId: string;
}

export interface RunErrorsHrefs {
  result: (resultId: string) => string;
  /** The run's own page, filtered to one error group. */
  errorGroup: (signature: string) => string;
}

export function RunErrors({ hrefs, groups }: { hrefs: RunErrorsHrefs; groups: ErrorGroup[] }) {
  if (groups.length === 0) {
    return <EmptyState icon={CheckCircle2} title="No errors" description="No test in this run reported an error." />;
  }
  return (
    <ErrorGroupList
      groups={groups.map(({ sampleResultId, ...group }) => ({
        ...group,
        sampleHref: hrefs.result(sampleResultId),
        groupHref: hrefs.errorGroup(group.signature),
      }))}
    />
  );
}
