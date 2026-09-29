'use client';

import { Code2, Link2, Unlink } from 'lucide-react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { StatusBadge } from '../../patterns/status-badge';
import { formatRelative } from '../../lib/format';
import type { LinkedTest } from '../../lib/test-case-models';
import { LINK_SOURCE_LABELS } from '../../lib/test-cases';
import { Link } from '../../provider';

export interface LinkedTestsHrefs {
  test: (testId: string) => string;
  run: (number: number) => string;
}

/**
 * The Playwright tests covering a case, each with its latest result and its
 * last 30 days. A link from code can be removed here, but it comes back with
 * the next run for as long as the test's code names the case.
 */
export function LinkedTests({
  caseKey,
  links,
  hrefs,
  now,
  canEdit = false,
  onUnlink,
  pendingTestId,
  linkAction,
}: {
  caseKey: string;
  links: LinkedTest[];
  hrefs: LinkedTestsHrefs;
  now?: Date;
  canEdit?: boolean;
  onUnlink?: (test: LinkedTest) => void;
  pendingTestId?: string | null;
  /** The control that opens the test picker, supplied by the host. */
  linkAction?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="linked-tests-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="linked-tests-heading" className="text-headline-s">
          Linked Playwright tests
        </h2>
        {canEdit ? linkAction : null}
      </div>
      {links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-body-s text-muted-foreground">
          <p>No Playwright test covers this case yet.</p>
          <p className="mt-1">
            Tag a test with <code className="rounded bg-muted px-1 py-0.5 text-code-s text-foreground">@{caseKey}</code> or give it the annotation{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-code-s text-foreground">{`{ type: 'test-case', description: '${caseKey}' }`}</code>, and the next run links it.
          </p>
        </div>
      ) : (
        <ul className="panel divide-y divide-border">
          {links.map((t) => (
            <li key={t.testId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={hrefs.test(t.testId)} className="block truncate font-medium hover:underline" title={t.title}>
                  {t.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-s text-muted-foreground">
                  <span className="truncate text-code-s">{t.file}</span>
                  {t.pwProject ? <Badge variant="secondary">{t.pwProject}</Badge> : null}
                  <span className="inline-flex items-center gap-1" title={LINK_SOURCE_LABELS[t.source]}>
                    {t.source === 'code' ? <Code2 className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
                    {LINK_SOURCE_LABELS[t.source]}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {t.lastOutcome ? <StatusBadge status={t.lastOutcome} /> : <span className="text-body-s text-muted-foreground">Not run yet</span>}
                <div className="text-end text-body-s text-muted-foreground">
                  {t.lastRunNumber !== null ? (
                    <Link href={hrefs.run(t.lastRunNumber)} className="hover:underline">
                      Run #{t.lastRunNumber}
                    </Link>
                  ) : null}
                  {t.lastRunAt ? <div>{formatRelative(t.lastRunAt, { now })}</div> : null}
                </div>
                <div className="w-28 text-end text-body-s tabular-nums text-muted-foreground" title="Runs in the last 30 days">
                  {t.runs ? (
                    <>
                      {t.passed}/{t.runs} passed
                      {t.flaky ? <div>{t.flaky} flaky</div> : null}
                    </>
                  ) : (
                    'No runs in 30 days'
                  )}
                </div>
                {canEdit && onUnlink ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Unlink ${t.title} (${t.pwProject || 'default project'})`}
                    title={t.source === 'code' ? 'Unlink. The next run links it again while the test still names this case.' : 'Unlink'}
                    disabled={pendingTestId === t.testId}
                    onClick={() => onUnlink(t)}
                  >
                    <Unlink className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
