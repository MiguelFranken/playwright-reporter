'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AdminTeams, type AdminTeamRow } from '@miguelfranken/ui/views/admin/admin-teams';
import { createTeam, deleteTeam } from '@/app/(app)/admin/actions';

export type { AdminTeamRow } from '@miguelfranken/ui/views/admin/admin-teams';

/** Binds Admin → Teams to the create and delete actions. */
export function AdminTeamsCard({ teams }: { teams: AdminTeamRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminTeamRow | null>(null);
  const [creating, startCreate] = useTransition();
  const [deleting, startDelete] = useTransition();

  return (
    <AdminTeams
      teams={teams}
      teamHref={(t) => `/teams/${t.slug}/settings/members`}
      createOpen={createOpen}
      onCreateOpenChange={setCreateOpen}
      creating={creating}
      onCreate={({ name, slug }) =>
        startCreate(async () => {
          const res = await createTeam(name, slug);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          setCreateOpen(false);
          router.push(`/teams/${res.slug}/settings/members`);
        })
      }
      toDelete={toDelete}
      onDeleteRequest={setToDelete}
      deleting={deleting}
      onDelete={(team, confirmation) =>
        startDelete(async () => {
          const res = await deleteTeam(team.id, confirmation);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          toast.success(`${team.name} was deleted.`);
          setToDelete(null);
          router.refresh();
        })
      }
    />
  );
}
