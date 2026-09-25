'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { TypeToConfirmDialog } from '../../patterns/type-to-confirm-dialog';

export interface ForceDeleteStorageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the superadmin must type to arm the dialog. */
  expected: string;
  pending?: boolean;
  /** Called with the typed text, which equals `expected`. */
  onConfirm: (confirmation: string) => void;
}

/**
 * "Force delete": evicts every stored artifact, whatever the policy says. The
 * button opens a type-to-confirm dialog; nothing happens until it is armed.
 */
export function ForceDeleteStorage({ open, onOpenChange, expected, pending = false, onConfirm }: ForceDeleteStorageProps) {
  return (
    <>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => onOpenChange(true)}>
        <Trash2 data-icon="inline-start" />
        {pending ? 'Deleting…' : 'Force delete'}
      </Button>
      <TypeToConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Delete every artifact"
        description="This deletes every screenshot, video, trace and attachment from the store, ignoring the retention policy. Runs keep their results, errors and steps, and show the artifacts as expired. It cannot be undone."
        expected={expected}
        inputLabel="Confirmation"
        confirmLabel="Delete all artifacts"
        pendingLabel="Deleting…"
        pending={pending}
        onConfirm={onConfirm}
      />
    </>
  );
}
