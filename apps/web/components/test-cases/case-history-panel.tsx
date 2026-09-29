'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { CaseVersionRow } from '@miguelfranken/ui/lib/test-case-models';
import type { CaseFieldDef } from '@miguelfranken/ui/lib/test-cases';
import { CaseHistory } from '@miguelfranken/ui/views/test-cases/case-history';
import { restoreVersion } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import type { ProjectRef } from '@/lib/rpc/client';

/** The history page's body, with restoring. The comparison resets to the two newest versions after a restore. */
export function CaseHistoryPanel({
  projectRef,
  caseId,
  versions,
  fieldDefs,
  canEdit,
  now,
}: {
  projectRef: ProjectRef;
  caseId: string;
  versions: CaseVersionRow[];
  fieldDefs: CaseFieldDef[];
  canEdit: boolean;
  now: Date;
}) {
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  return (
    <CaseHistory
      key={versions[0]?.version ?? 0}
      versions={versions}
      fieldDefs={fieldDefs}
      now={now}
      canEdit={canEdit}
      pendingVersion={pendingVersion}
      onRestore={(version) => {
        if (!window.confirm(`Restore version ${version}? Its fields are saved as a new version; nothing is lost.`)) return;
        setPendingVersion(version);
        startTransition(async () => {
          const res = await restoreVersion(projectRef, caseId, version);
          if (res.ok) toast.success(res.message);
          else toast.error(res.message);
          setPendingVersion(null);
        });
      }}
    />
  );
}
