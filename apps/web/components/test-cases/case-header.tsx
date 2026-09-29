import { BackLink } from '@miguelfranken/ui/patterns/back-link';
import { CopyButton } from '@miguelfranken/ui/patterns/copy-button';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import type { CaseDetail } from '@miguelfranken/ui/lib/test-case-models';
import { caseKey } from '@miguelfranken/ui/lib/test-cases';
import { CaseTabs } from './case-tabs';
import { AutomationBadge, CaseStatusBadge, VerdictBadge } from '@miguelfranken/ui/views/test-cases/case-badges';

/** The top of every page of one case: back to the list, key and title, and the Overview / History tabs. */
export function CaseHeader({
  base,
  detail,
  listHref,
  active,
  actions,
}: {
  base: string;
  detail: CaseDetail;
  listHref: string;
  active: 'overview' | 'history' | null;
  actions?: React.ReactNode;
}) {
  const key = caseKey(detail.number);
  const page = `${base}/cases/${detail.number}`;
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={listHref}>{detail.suitePath.length ? detail.suitePath.join(' / ') : 'Test Cases'}</BackLink>
      <PageHeader
        title={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-code-s text-accent-text">
              {key}
              <CopyButton value={key} label={`Copy ${key}`} />
            </span>
            <span className="min-w-0 break-words">{detail.title}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CaseStatusBadge status={detail.status} />
            <AutomationBadge automation={detail.automation} linkCount={detail.linkCount} />
            {detail.linkCount ? <VerdictBadge verdict={detail.verdict} /> : null}
          </span>
        }
      >
        {actions}
      </PageHeader>
      {active ? (
        <CaseTabs page={page} active={active} version={detail.version} />
      ) : null}
    </div>
  );
}
