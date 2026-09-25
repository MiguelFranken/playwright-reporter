'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { CreateWithSlugDialog } from '../../patterns/create-with-slug-dialog';
import { TypeToConfirmDialog } from '../../patterns/type-to-confirm-dialog';
import { Link } from '../../provider';

export type AdminTeamRow = { id: string; slug: string; name: string; memberCount: number; projectCount: number; createdAt: string };

export interface AdminTeamsProps {
  teams: AdminTeamRow[];
  /** Where a team's name links to. */
  teamHref: (team: AdminTeamRow) => string;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  creating?: boolean;
  onCreate: (values: { name: string; slug: string }) => void;
  /** The team whose deletion is being confirmed. */
  toDelete: AdminTeamRow | null;
  onDeleteRequest: (team: AdminTeamRow | null) => void;
  deleting?: boolean;
  onDelete: (team: AdminTeamRow, confirmation: string) => void;
}

/**
 * Admin → Teams. The card this sits in runs its content edge to edge so the
 * table can too, which means the toolbar re-states the card's own inset via
 * `--card-spacing`, following the card's size.
 */
export function AdminTeams({
  teams,
  teamHref,
  createOpen,
  onCreateOpenChange,
  creating = false,
  onCreate,
  toDelete,
  onDeleteRequest,
  deleting = false,
  onDelete,
}: AdminTeamsProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-(--card-spacing) py-3">
        <p className="text-sm text-muted-foreground">
          {teams.length} {teams.length === 1 ? 'team' : 'teams'} on this instance.
        </p>
        <Button size="sm" onClick={() => onCreateOpenChange(true)}>
          <Plus data-icon="inline-start" />
          New team
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <Link href={teamHref(t)} className="hover:underline">
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell className="text-code-s text-muted-foreground">{t.slug}</TableCell>
                <TableCell className="text-right tabular-nums">{t.memberCount}</TableCell>
                <TableCell className="text-right tabular-nums">{t.projectCount}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{t.createdAt}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => onDeleteRequest(t)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateWithSlugDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        title="New team"
        description="You become its first admin, so you can invite people right away."
        idPrefix="new-team"
        pathPrefix="/teams/"
        submitLabel="Create team"
        pendingLabel="Creating…"
        pending={creating}
        onSubmit={onCreate}
      />

      <TypeToConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => (!open ? onDeleteRequest(null) : null)}
        title={<>Delete {toDelete?.name}</>}
        description={
          <>
            This deletes {toDelete?.projectCount ?? 0} project(s) with all their runs and artifacts, and removes {toDelete?.memberCount ?? 0}{' '}
            membership(s).
          </>
        }
        expected={toDelete?.slug ?? ''}
        inputLabel="Team slug"
        confirmLabel="Delete team"
        pendingLabel="Deleting…"
        pending={deleting}
        onConfirm={(confirmation) => toDelete && onDelete(toDelete, confirmation)}
      />
    </div>
  );
}
