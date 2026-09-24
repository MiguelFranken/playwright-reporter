'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@miguelfranken/ui/components/button';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';
import { renameProject, type RenameState } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

export function ProjectRenameForm({ teamSlug, projectSlug, name }: { teamSlug: string; projectSlug: string; name: string }) {
  const [state, action, pending] = useActionState<RenameState, FormData>(renameProject, null);
  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="team" value={teamSlug} />
      <input type="hidden" name="project" value={projectSlug} />
      <Label htmlFor="project-name">Project name</Label>
      <div className="flex gap-2">
        <Input id="project-name" name="name" defaultValue={name} maxLength={80} required className="h-8 max-w-sm" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {state && !state.ok ? <p className="text-xs text-destructive">{state.message}</p> : null}
    </form>
  );
}
