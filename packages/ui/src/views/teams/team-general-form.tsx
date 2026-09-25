'use client';

import { useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';

export interface TeamGeneralFormProps {
  name: string;
  slug: string;
  pending?: boolean;
  onSubmit: (values: { name: string; slug: string }) => void;
}

/** Team settings → General: the team's name and slug. Save arms once either changes. */
export function TeamGeneralForm({ name: initialName, slug: initialSlug, pending = false, onSubmit }: TeamGeneralFormProps) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const dirty = name !== initialName || slug !== initialSlug;

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, slug });
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
