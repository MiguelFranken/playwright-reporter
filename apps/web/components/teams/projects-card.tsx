'use client';

import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createProject, deleteProject } from '@/app/(app)/teams/[team]/settings/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@miguelfranken/ui/components/dialog';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';
import { slugify } from '@/lib/auth/slug';

export type ProjectRow = { id: string; slug: string; name: string; runCounter: number; createdAt: string };

export function ProjectsCard({
  teamSlug,
  projects,
  canCreate,
  canDelete,
}: {
  teamSlug: string;
  projects: ProjectRow[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectRow | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'} in this team.
        </p>
        {canCreate ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            New project
          </Button>
        ) : null}
      </div>

      <div className="panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Runs</TableHead>
              <TableHead>Created</TableHead>
              {canDelete ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/teams/${teamSlug}/projects/${p.slug}/dashboard`} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-code-s text-muted-foreground">{p.slug}</TableCell>
                <TableCell className="text-right tabular-nums">{p.runCounter}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{p.createdAt}</TableCell>
                {canDelete ? (
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.name}`} onClick={() => setToDelete(p)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateProjectDialog teamSlug={teamSlug} open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteProjectDialog teamSlug={teamSlug} project={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}

function CreateProjectDialog({ teamSlug, open, onOpenChange }: { teamSlug: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();
  const effectiveSlug = touched ? slug : slugify(name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A project collects the runs of one Playwright test suite.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-name">Name</Label>
            <Input id="new-project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-slug">Slug</Label>
            <Input
              id="new-project-slug"
              value={effectiveSlug}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value);
              }}
              className="text-code-s"
            />
            <p className="text-xs text-muted-foreground">
              /teams/{teamSlug}/projects/{effectiveSlug || '…'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={pending || !name.trim() || !effectiveSlug}
            onClick={() =>
              startTransition(async () => {
                const res = await createProject(teamSlug, name, effectiveSlug);
                if (!res.ok) {
                  toast.error(res.message);
                  return;
                }
                onOpenChange(false);
                setName('');
                setSlug('');
                setTouched(false);
                router.push(`/teams/${teamSlug}/projects/${res.slug}/settings`);
              })
            }
          >
            {pending ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectDialog({ teamSlug, project, onClose }: { teamSlug: string; project: ProjectRow | null; onClose: () => void }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={Boolean(project)}
      onOpenChange={(v) => {
        if (!v) {
          setConfirmation('');
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {project?.name}</DialogTitle>
          <DialogDescription>
            This removes every run, test result and artifact of this project. It cannot be undone. Type{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-code-s">{project?.slug}</code> to confirm.
          </DialogDescription>
        </DialogHeader>
        <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="text-code-s" autoFocus />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending || !project || confirmation !== project.slug}
            onClick={() =>
              startTransition(async () => {
                if (!project) return;
                const res = await deleteProject(teamSlug, project.slug, confirmation);
                if (!res.ok) {
                  toast.error(res.message);
                  return;
                }
                toast.success(`${project.name} was deleted.`);
                setConfirmation('');
                onClose();
                router.refresh();
              })
            }
          >
            {pending ? 'Deleting…' : 'Delete project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
