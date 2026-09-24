'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteProject } from '@/app/(app)/teams/[team]/settings/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@miguelfranken/ui/components/dialog';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';

/**
 * Deleting a project is the one irreversible action on this page, so it gets
 * its own card away from the settings people edit daily, plus the same
 * type-the-slug confirmation the team-level list uses.
 */
export function ProjectDangerZone({ teamSlug, projectSlug, name }: { teamSlug: string; projectSlug: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>Deleting this project removes every run, test result and artifact it holds. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete project
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setConfirmation('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {name}</DialogTitle>
            <DialogDescription>
              This removes every run, test result and artifact of this project. It cannot be undone. Type{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-code-s">{projectSlug}</code> to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-project-confirmation">Project slug</Label>
            <Input
              id="delete-project-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="text-code-s"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending || confirmation !== projectSlug}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteProject(teamSlug, projectSlug, confirmation);
                  if (!res.ok) {
                    toast.error(res.message);
                    return;
                  }
                  toast.success(`${name} was deleted.`);
                  setConfirmation('');
                  setOpen(false);
                  // The current route no longer exists: leave before it 404s.
                  router.replace(`/teams/${teamSlug}/settings/projects`);
                })
              }
            >
              {pending ? 'Deleting…' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
