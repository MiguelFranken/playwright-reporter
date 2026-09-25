'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { ProjectRenameForm as ProjectRenameFormView } from '@miguelfranken/ui/views/settings/project-rename-form';
import { renameProject, type RenameState } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

/** Binds the project name form to its server action. */
export function ProjectRenameForm({ teamSlug, projectSlug, name }: { teamSlug: string; projectSlug: string; name: string }) {
  const [state, action, pending] = useActionState<RenameState, FormData>(renameProject, null);
  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
  return (
    <ProjectRenameFormView name={name} action={action} pending={pending} error={state && !state.ok ? state.message : null}>
      <input type="hidden" name="team" value={teamSlug} />
      <input type="hidden" name="project" value={projectSlug} />
    </ProjectRenameFormView>
  );
}
