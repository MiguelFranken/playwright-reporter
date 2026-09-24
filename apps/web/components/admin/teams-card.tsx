'use client';

import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createTeam, deleteTeam } from '@/app/(app)/admin/actions';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table';
import { slugify } from '@/lib/auth/slug';

export type AdminTeamRow = { id: string; slug: string; name: string; memberCount: number; projectCount: number; createdAt: string };

export function AdminTeamsCard({ teams }: { teams: AdminTeamRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminTeamRow | null>(null);

  return (
    // The card this sits in runs its content edge to edge so the table can too,
    // which means the toolbar has to re-state the card's own inset. It tracks
    // `--card-spacing` rather than a literal, so it follows the card's size.
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-(--card-spacing) py-3">
        <p className="text-sm text-muted-foreground">
          {teams.length} {teams.length === 1 ? 'team' : 'teams'} on this instance.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
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
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <Link href={`/teams/${t.slug}/settings/members`} className="hover:underline">
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell className="text-code-s text-muted-foreground">{t.slug}</TableCell>
                <TableCell className="text-right tabular-nums">{t.memberCount}</TableCell>
                <TableCell className="text-right tabular-nums">{t.projectCount}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{t.createdAt}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setToDelete(t)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog
        open={Boolean(toDelete)}
        onOpenChange={(v) => {
          if (!v) setToDelete(null);
        }}
      >
        <DeleteTeamBody team={toDelete} onClose={() => setToDelete(null)} />
      </Dialog>
    </div>
  );
}

function CreateTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>You become its first admin, so you can invite people right away.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-team-name">Name</Label>
            <Input id="new-team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-team-slug">Slug</Label>
            <Input
              id="new-team-slug"
              value={effectiveSlug}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value);
              }}
              className="text-code-s"
            />
            <p className="text-xs text-muted-foreground">/teams/{effectiveSlug || '…'}</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={pending || !name.trim() || !effectiveSlug}
            onClick={() =>
              startTransition(async () => {
                const res = await createTeam(name, effectiveSlug);
                if (!res.ok) {
                  toast.error(res.message);
                  return;
                }
                onOpenChange(false);
                setName('');
                setSlug('');
                setTouched(false);
                router.push(`/teams/${res.slug}/settings/members`);
              })
            }
          >
            {pending ? 'Creating…' : 'Create team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTeamBody({ team, onClose }: { team: AdminTeamRow | null; onClose: () => void }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Delete {team?.name}</DialogTitle>
        <DialogDescription>
          This deletes {team?.projectCount ?? 0} project(s) with all their runs and artifacts, and removes {team?.memberCount ?? 0}{' '}
          membership(s). Type <code className="rounded bg-muted px-1 py-0.5 text-code-s">{team?.slug}</code> to confirm.
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
          disabled={pending || !team || confirmation !== team.slug}
          onClick={() =>
            startTransition(async () => {
              if (!team) return;
              const res = await deleteTeam(team.id, confirmation);
              if (!res.ok) {
                toast.error(res.message);
                return;
              }
              toast.success(`${team.name} was deleted.`);
              setConfirmation('');
              onClose();
              router.refresh();
            })
          }
        >
          {pending ? 'Deleting…' : 'Delete team'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
