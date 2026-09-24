'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@miguelfranken/ui/components/button';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';
import { updateDefaultBranch, type DefaultBranchState } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

/**
 * Edits `settings.defaultBranch`. The placeholder is the branch the server
 * would fall back to right now, so an empty field still says what it means;
 * clearing the field returns to that fallback.
 */
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
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="team" value={teamSlug} />
      <input type="hidden" name="project" value={projectSlug} />
      <Label htmlFor="project-default-branch">Base branch</Label>
      <div className="flex gap-2">
        <Input
          id="project-default-branch"
          name="defaultBranch"
          defaultValue={value}
          placeholder={fallback}
          maxLength={200}
          aria-describedby="project-default-branch-help"
          className="h-8 max-w-sm"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <p id="project-default-branch-help" className="text-xs text-muted-foreground">
        Used by AI assistants to tell new failures from ones already failing on the base branch.
        {value ? null : ` Leave empty to use ${fallback}.`}
      </p>
      {state && !state.ok ? <p className="text-xs text-destructive">{state.message}</p> : null}
    </form>
  );
}
