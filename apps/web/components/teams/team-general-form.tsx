'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { TeamGeneralForm as TeamGeneralFormView } from '@miguelfranken/ui/views/teams/team-general-form';
import { updateTeam } from '@/app/(app)/teams/[team]/settings/actions';

/** Saves the team's name and slug; a new slug moves the page to the team's new URL. */
export function TeamGeneralForm({ teamSlug, name }: { teamSlug: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <TeamGeneralFormView
      name={name}
      slug={teamSlug}
      pending={pending}
      onSubmit={(values) =>
        startTransition(async () => {
          const res = await updateTeam(teamSlug, values.name, values.slug);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          toast.success('Team updated.');
          // The slug is part of the URL, so a rename has to navigate. Otherwise
          // the action's revalidation has already re-rendered the page.
          if (res.slug !== teamSlug) router.replace(`/teams/${res.slug}/settings/general`);
        })
      }
    />
  );
}
