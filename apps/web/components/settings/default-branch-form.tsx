'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { DefaultBranchForm as DefaultBranchFormView } from '@miguelfranken/ui/views/settings/default-branch-form';
import { updateDefaultBranch, type DefaultBranchState } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

/** Binds the base-branch form to its server action. */
export function DefaultBranchForm({
  teamSlug,
  projectSlug,
  value,
  fallback,
}: {
  teamSlug: string;
  projectSlug: string;
  /** The configured branch, or `''` when none is set. */
  value: string;
  /** What comparisons use when `value` is empty. */
  fallback: string;
}) {
  const [state, action, pending] = useActionState<DefaultBranchState, FormData>(updateDefaultBranch, null);
  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
  return (
    <DefaultBranchFormView value={value} fallback={fallback} action={action} pending={pending} error={state && !state.ok ? state.message : null}>
      <input type="hidden" name="team" value={teamSlug} />
      <input type="hidden" name="project" value={projectSlug} />
    </DefaultBranchFormView>
  );
}
