'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateTeam } from '@/app/(app)/teams/[team]/settings/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';

export function TeamGeneralForm({ teamSlug, name: initialName }: { teamSlug: string; name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(teamSlug);
  const [pending, startTransition] = useTransition();
  const dirty = name !== initialName || slug !== teamSlug;

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateTeam(teamSlug, name, slug);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          toast.success('Team updated.');
          // The slug is part of the URL, so a rename has to navigate.
          if (res.slug !== teamSlug) router.replace(`/teams/${res.slug}/settings/general`);
          else router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-name">Team name</Label>
        <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-slug">Slug</Label>
        <Input id="team-slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="text-code-s" required />
        <p className="text-xs text-muted-foreground">Changing it changes every URL of this team: /teams/{slug || '…'}</p>
      </div>
      <Button type="submit" size="sm" className="self-start" disabled={pending || !dirty}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
