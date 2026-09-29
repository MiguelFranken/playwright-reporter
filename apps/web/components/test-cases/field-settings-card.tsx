'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { CaseFieldDef } from '@miguelfranken/ui/lib/test-cases';
import { FieldSettings } from '@miguelfranken/ui/views/test-cases/field-settings';
import { saveFieldDefs } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';

/** The custom fields card of the project settings. It remounts after a save, so its drafts start from what was stored. */
export function FieldSettingsCard({ teamSlug, projectSlug, defs, canEdit }: { teamSlug: string; projectSlug: string; defs: CaseFieldDef[]; canEdit: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <FieldSettings
      key={JSON.stringify(defs)}
      defs={defs}
      canEdit={canEdit}
      pending={pending}
      error={error}
      onSave={(next) =>
        startTransition(async () => {
          setError(null);
          const res = await saveFieldDefs({ team: teamSlug, project: projectSlug }, next);
          if (res.ok) toast.success(res.message);
          else setError(res.message);
        })
      }
    />
  );
}
