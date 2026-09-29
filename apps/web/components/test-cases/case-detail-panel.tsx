'use client';

import { Link2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@miguelfranken/ui/components/button';
import type { CaseDetail } from '@miguelfranken/ui/lib/test-case-models';
import { caseKey, type CaseFieldDef } from '@miguelfranken/ui/lib/test-cases';
import { CaseDetailView } from '@miguelfranken/ui/views/test-cases/case-detail';
import { linkTests, unlinkTest } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import type { ProjectRef } from '@/lib/rpc/client';
import { ConnectedTestPicker } from './test-picker';

/** A case's page body, with linking and unlinking Playwright tests. */
export function CaseDetailPanel({
  base,
  projectRef,
  detail,
  fieldDefs,
  canEdit,
  neighbours,
  neighbourQuery,
  now,
}: {
  /** The list's filters, kept on the previous and next links. */
  neighbourQuery: string;
  base: string;
  projectRef: ProjectRef;
  detail: CaseDetail;
  fieldDefs: CaseFieldDef[];
  canEdit: boolean;
  neighbours: { previous: number | null; next: number | null; index: number | null; total: number };
  now: Date;
}) {
  const [picking, setPicking] = useState(false);
  const [pendingTestId, setPendingTestId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = caseKey(detail.number);

  return (
    <>
      <CaseDetailView
        detail={detail}
        fieldDefs={fieldDefs}
        now={now}
        canEdit={canEdit}
        position={neighbours.index ? { index: neighbours.index, total: neighbours.total } : null}
        hrefs={{
          test: (id) => `${base}/tests/${id}`,
          run: (n) => `${base}/runs/${n}`,
          previous: neighbours.previous ? `${base}/cases/${neighbours.previous}${neighbourQuery}` : null,
          next: neighbours.next ? `${base}/cases/${neighbours.next}${neighbourQuery}` : null,
        }}
        pendingTestId={pendingTestId}
        onUnlink={(test) => {
          setPendingTestId(test.testId);
          startTransition(async () => {
            const res = await unlinkTest(projectRef, detail.id, test.testId);
            if (res.ok) toast.success(res.message);
            else toast.error(res.message);
            setPendingTestId(null);
          });
        }}
        linkAction={
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            <Link2 className="size-3.5" />
            Link tests
          </Button>
        }
      />
      <ConnectedTestPicker
        projectRef={projectRef}
        open={picking}
        onOpenChange={setPicking}
        mode="link"
        title={`Link Playwright tests to ${key}`}
        description={
          <>
            Linked tests report their results on this case and mark it automated. Linking from code is sturdier: tag the test with{' '}
            <code className="text-code-s">@{key}</code>.
          </>
        }
        pending={pending}
        onConfirm={({ testIds }) =>
          startTransition(async () => {
            const res = await linkTests(projectRef, detail.id, testIds);
            if (!res.ok) {
              toast.error(res.message);
              return;
            }
            toast.success(res.message);
            setPicking(false);
          })
        }
      />
    </>
  );
}
