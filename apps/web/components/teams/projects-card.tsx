'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { TeamProjects, type ProjectRow } from '@miguelfranken/ui/views/teams/team-projects';
import { createProject, deleteProject } from '@/app/(app)/teams/[team]/settings/actions';

export type { ProjectRow } from '@miguelfranken/ui/views/teams/team-projects';

/** Binds the team's project list to the create and delete actions. */
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
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectRow | null>(null);
  const [creating, startCreate] = useTransition();
  const [deleting, startDelete] = useTransition();

  return (
    <TeamProjects
      teamSlug={teamSlug}
      projects={projects}
      projectHref={(p) => `/teams/${teamSlug}/projects/${p.slug}/dashboard`}
      canCreate={canCreate}
      canDelete={canDelete}
      createOpen={createOpen}
      onCreateOpenChange={setCreateOpen}
      creating={creating}
      onCreate={({ name, slug }) =>
        startCreate(async () => {
          const res = await createProject(teamSlug, name, slug);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          setCreateOpen(false);
          router.push(`/teams/${teamSlug}/projects/${res.slug}/settings`);
        })
      }
      toDelete={toDelete}
      onDeleteRequest={setToDelete}
      deleting={deleting}
      onDelete={(project, confirmation) =>
        startDelete(async () => {
          const res = await deleteProject(teamSlug, project.slug, confirmation);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          toast.success(`${project.name} was deleted.`);
          setToDelete(null);
        })
      }
    />
  );
}
