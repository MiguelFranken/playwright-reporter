'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ProjectDangerZone as ProjectDangerZoneView } from '@miguelfranken/ui/views/settings/project-danger-zone';
import { deleteProject } from '@/app/(app)/teams/[team]/settings/actions';

/** Deletes the project, then leaves its settings page before it 404s. */
export function ProjectDangerZone({ teamSlug, projectSlug, name }: { teamSlug: string; projectSlug: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <ProjectDangerZoneView
      name={name}
      slug={projectSlug}
      open={open}
      onOpenChange={setOpen}
      pending={pending}
      onDelete={(confirmation) =>
        startTransition(async () => {
          const res = await deleteProject(teamSlug, projectSlug, confirmation);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          toast.success(`${name} was deleted.`);
          setOpen(false);
          // The current route no longer exists: leave before it 404s.
          router.replace(`/teams/${teamSlug}/settings/projects`);
        })
      }
    />
  );
}
