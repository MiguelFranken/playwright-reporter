'use client';

import { useState } from 'react';
import { Button } from '../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/dialog';
import { Input } from '../components/input';
import { Label } from '../components/label';

export interface TypeToConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** What is lost. The dialog adds "Type <expected> to confirm." after it. */
  description: React.ReactNode;
  /** What the user must type, usually a slug. */
  expected: string;
  /** Names the input, e.g. "Project slug". */
  inputLabel: string;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  /** Called with the typed text, which equals `expected`. */
  onConfirm: (confirmation: string) => void;
}

/**
 * The confirmation for an irreversible deletion: the button only arms once the
 * user has typed the thing's slug. The text clears whenever the dialog closes.
 */
export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  expected,
  inputLabel,
  confirmLabel,
  pendingLabel,
  pending = false,
  onConfirm,
}: TypeToConfirmDialogProps) {
  const [confirmation, setConfirmation] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setConfirmation('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description} Type <code className="rounded bg-muted px-1 py-0.5 text-code-s">{expected}</code> to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type-to-confirm">{inputLabel}</Label>
          <Input id="type-to-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="text-code-s" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={pending || confirmation !== expected} onClick={() => onConfirm(confirmation)}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
