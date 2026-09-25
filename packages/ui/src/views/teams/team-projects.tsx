'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { CreateWithSlugDialog } from '../../patterns/create-with-slug-dialog';
import { TypeToConfirmDialog } from '../../patterns/type-to-confirm-dialog';
import { Link } from '../../provider';

export type ProjectRow = { id: string; slug: string; name: string; runCounter: number; createdAt: string };

export interface TeamProjectsProps {
  teamSlug: string;
  projects: ProjectRow[];
  /** Where a project's name links to. */
  projectHref: (project: ProjectRow) => string;
  canCreate: boolean;
  canDelete: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  creating?: boolean;
  onCreate: (values: { name: string; slug: string }) => void;
  /** The project whose deletion is being confirmed. */
  toDelete: ProjectRow | null;
  onDeleteRequest: (project: ProjectRow | null) => void;
  deleting?: boolean;
  onDelete: (project: ProjectRow, confirmation: string) => void;
}

/** Team settings → Projects: the team's projects, with create and type-the-slug delete. */
export function TeamProjects({
  teamSlug,
  projects,
  projectHref,
  canCreate,
  canDelete,
  createOpen,
  onCreateOpenChange,
  creating = false,
  onCreate,
  toDelete,
  onDeleteRequest,
  deleting = false,
  onDelete,
}: TeamProjectsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'} in this team.
        </p>
        {canCreate ? (
          <Button size="sm" onClick={() => onCreateOpenChange(true)}>
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
              {canDelete ? (
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={projectHref(p)} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-code-s text-muted-foreground">{p.slug}</TableCell>
                <TableCell className="text-right tabular-nums">{p.runCounter}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{p.createdAt}</TableCell>
                {canDelete ? (
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.name}`} onClick={() => onDeleteRequest(p)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateWithSlugDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        title="New project"
        description="A project collects the runs of one Playwright test suite."
        idPrefix="new-project"
        pathPrefix={`/teams/${teamSlug}/projects/`}
        submitLabel="Create project"
        pendingLabel="Creating…"
        pending={creating}
        onSubmit={onCreate}
      />
      <DeleteProjectDialog
        project={toDelete}
        onClose={() => onDeleteRequest(null)}
        pending={deleting}
        onDelete={(confirmation) => toDelete && onDelete(toDelete, confirmation)}
      />
    </div>
  );
}

/** Type-the-slug confirmation for deleting a project; shared with the project's danger zone. */
export function DeleteProjectDialog({
  project,
  onClose,
  pending = false,
  onDelete,
}: {
  project: { name: string; slug: string } | null;
  onClose: () => void;
  pending?: boolean;
  onDelete: (confirmation: string) => void;
}) {
  return (
    <TypeToConfirmDialog
      open={project !== null}
      onOpenChange={(open) => (!open ? onClose() : null)}
      title={<>Delete {project?.name}</>}
      description="This removes every run, test result and artifact of this project. It cannot be undone."
      expected={project?.slug ?? ''}
      inputLabel="Project slug"
      confirmLabel="Delete project"
      pendingLabel="Deleting…"
      pending={pending}
      onConfirm={onDelete}
    />
  );
}
