'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { VisualDiffForm as VisualDiffFormView, type VisualDiffValues } from '@miguelfranken/ui/views/settings/visual-diff-form';
import { updateVisualDiff, type VisualDiffState } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

/** Binds the visual comparison settings to their server action. */
export function VisualDiffForm({ teamSlug, projectSlug, value, disabled, inactiveReason }: { teamSlug: string; projectSlug: string; value: VisualDiffValues; disabled: boolean; inactiveReason: string | null }) {
  const [state, action, pending] = useActionState<VisualDiffState, FormData>(updateVisualDiff, null);
  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
  return (
    <VisualDiffFormView value={value} action={action} pending={pending} disabled={disabled} inactiveReason={inactiveReason} error={state && !state.ok ? state.message : null}>
      <input type="hidden" name="team" value={teamSlug} />
      <input type="hidden" name="project" value={projectSlug} />
    </VisualDiffFormView>
  );
}
