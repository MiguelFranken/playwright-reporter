'use client';

import { useState } from 'react';
import { Button } from '../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/dialog';
import { Input } from '../components/input';
import { Label } from '../components/label';
import { slugify } from '../lib/slug';

export interface CreateWithSlugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Prefix for the field ids, e.g. `new-project` → `new-project-name`, `new-project-slug`. */
  idPrefix: string;
  /** The URL the slug lands in, shown under the field: `/teams/acme/projects/`. */
  pathPrefix: string;
  submitLabel: string;
  pendingLabel: string;
  pending?: boolean;
  onSubmit: (values: { name: string; slug: string }) => void;
}

/**
 * Name something that gets a URL. The slug follows the name until the user
 * edits it, and the URL it will live at is spelled out under the field.
 * The fields reset whenever the dialog closes.
 */
export function CreateWithSlugDialog({
  open,
  onOpenChange,
  title,
  description,
  idPrefix,
  pathPrefix,
  submitLabel,
  pendingLabel,
  pending = false,
  onSubmit,
}: CreateWithSlugDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setName('');
      setSlug('');
      setTouched(false);
    }
  }
  const effectiveSlug = touched ? slug : slugify(name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-name`}>Name</Label>
            <Input id={`${idPrefix}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-slug`}>Slug</Label>
            <Input
              id={`${idPrefix}-slug`}
              value={effectiveSlug}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value);
              }}
              className="text-code-s"
            />
            <p className="text-xs text-muted-foreground">
              {pathPrefix}
              {effectiveSlug || '…'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" disabled={pending || !name.trim() || !effectiveSlug} onClick={() => onSubmit({ name, slug: effectiveSlug })}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
