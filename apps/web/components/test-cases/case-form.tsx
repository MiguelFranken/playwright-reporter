'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { SuiteOption } from '@miguelfranken/ui/lib/test-case-models';
import type { CaseFieldDef } from '@miguelfranken/ui/lib/test-cases';
import { CaseEditor, type CaseEditorValues } from '@miguelfranken/ui/views/test-cases/case-editor';
import { createCase, updateCase } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import type { ProjectRef } from '@/lib/rpc/client';

/**
 * Creates a case, or saves an edit to one. An edit carries the version it
 * started from, so saving over someone else's newer change is refused.
 */
export function CaseForm({
  base,
  projectRef,
  initial,
  suites,
  fieldDefs,
  editing,
}: {
  base: string;
  projectRef: ProjectRef;
  initial: CaseEditorValues;
  suites: SuiteOption[];
  fieldDefs: CaseFieldDef[];
  editing?: { caseId: string; number: number; version: number; linkCount: number };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <CaseEditor
      initial={initial}
      suites={suites}
      fieldDefs={fieldDefs}
      linkCount={editing?.linkCount ?? 0}
      submitLabel={editing ? 'Save changes' : 'Create test case'}
      pendingLabel={editing ? 'Saving…' : 'Creating…'}
      pending={pending}
      error={error}
      onCancel={() => router.push(editing ? `${base}/cases/${editing.number}` : `${base}/cases`)}
      onSubmit={(values) =>
        startTransition(async () => {
          setError(null);
          const res = editing ? await updateCase(projectRef, editing.caseId, values, editing.version) : await createCase(projectRef, values);
          if (!res.ok) {
            setError(res.message);
            return;
          }
          toast.success(res.message);
          router.push(`${base}/cases/${res.number}`);
        })
      }
    />
  );
}
